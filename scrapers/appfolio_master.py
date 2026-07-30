"""
Scrape master AppFolio property management pages directly to capture units
across all their buildings and map them to our properties database.
"""

import asyncio
import re
from datetime import datetime, timezone

import httpx
from bs4 import BeautifulSoup
from rich.console import Console

import availability
import db
from config import HEADERS, APPFOLIO_MASTER_URLS
from models import UnitListing
from scrapers.property_scraper import _normalize_unit_type

console = Console()

def _extract_street_num(address: str) -> str | None:
    m = re.search(r"^(\d+)", address.strip())
    return m.group(1) if m else None

def _fuzzy_match_property(appfolio_address: str, properties: list[dict]) -> int | None:
    if not appfolio_address:
        return None
    
    appfolio_address_lower = appfolio_address.lower()
    street_num = _extract_street_num(appfolio_address_lower)
    if not street_num:
        return None
    
    candidates = [p for p in properties if _extract_street_num(p["address"].lower()) == street_num]
    if not candidates:
        return None
    if len(candidates) == 1:
        return candidates[0]["id"]
        
    # Multiple candidates with same street number, check street name
    appfolio_words = set(re.findall(r"\w+", appfolio_address_lower))
    for c in candidates:
        db_addr_words = set(re.findall(r"\w+", c["address"].lower()))
        # Check intersection
        if len(appfolio_words.intersection(db_addr_words)) >= 2:
            return c["id"]
            
    return None

async def _scrape_appfolio_master(client: httpx.AsyncClient, url: str, properties: list[dict]) -> list[UnitListing]:
    try:
        res = await client.get(url, follow_redirects=True, timeout=30)
        res.raise_for_status()
    except Exception as e:
        console.print(f"[red]Failed to fetch {url}: {e}[/]")
        return []
        
    soup = BeautifulSoup(res.text, "lxml")
    listings = soup.find_all("div", class_=lambda c: c and "listing-item" in c)
    if not listings:
        listings = soup.find_all("article")
        
    results = []
    now = datetime.now(timezone.utc).isoformat()
    seen_listing_ids: set[str] = set()

    for div in listings:
        # AppFolio renders desktop and mobile variants of the same listing, so
        # dedupe on the stable per-listing id before doing any parsing.
        id_link = div.find("a", attrs={"data-listing-id": True})
        if id_link:
            listing_id = id_link["data-listing-id"]
            if listing_id in seen_listing_ids:
                continue
            seen_listing_ids.add(listing_id)

        # Address
        addr_span = div.find(class_=lambda c: c and "js-listing-address" in c)
        if not addr_span:
            continue
        address = addr_span.get_text(strip=True)
        
        property_id = _fuzzy_match_property(address, properties)
        if not property_id:
            continue
            
        # Rent
        rent_text = ""
        rent_div = div.find(class_=lambda c: c and "js-listing-blurb-rent" in c)
        if rent_div:
            rent_text = rent_div.get_text(strip=True)
        else:
            rent_text = div.get_text(" ", strip=True)
            
        # Extract rent using regex (avoiding deposit/fee)
        cleaned = re.sub(r'\$\s*[\d,]+\s*(?:[a-zA-Z-]+\s+){0,3}(?:deposit|fee|bonus|holding|refundable)\b', '', rent_text, flags=re.I)
        cleaned = re.sub(r'\b(?:deposit|fee)s?\b(?:[^\$]{0,30})\$\s*[\d,]+', '', cleaned, flags=re.I)
        rent_matches = [int(m.replace(",", "")) for m in re.findall(r"\$\s*(\d[\d,]*)\s*(?:/\s*mo(?:nth)?)?", cleaned)]
        rent_matches = [m for m in rent_matches if 400 < m < 20000]
        if not rent_matches:
            continue
        rent_min = min(rent_matches)
        rent_max = max(rent_matches)
        
        # Bed/Bath
        bb_text = ""
        bb_span = div.find(class_=lambda c: c and "js-listing-blurb-bed-bath" in c)
        if bb_span:
            bb_text = bb_span.get_text(strip=True)
        unit_type = _normalize_unit_type(bb_text) or _normalize_unit_type(div.get_text(" ", strip=True)) or "unknown"
        
        # Sqft
        sqft_text = ""
        sqft_span = div.find(class_=lambda c: c and "js-listing-square-feet" in c)
        if sqft_span:
            sqft_text = sqft_span.get_text(strip=True)
        sqft_m = re.search(r"(\d{3,4})", sqft_text)
        sqft = int(sqft_m.group(1)) if sqft_m else None
        if sqft and not (100 < sqft < 5000):
            sqft = None
            
        # Available
        avail_span = div.find(class_=lambda c: c and "js-listing-available" in c)
        avail = None
        if avail_span:
            avail_text = avail_span.get_text(strip=True)
            avail = availability.extract_raw(avail_text, field_is_availability=True)
        
        results.append(UnitListing(
            property_id=property_id,
            unit_type=unit_type,
            sqft=sqft,
            rent_min=rent_min,
            rent_max=rent_max,
            available_count=None,
            available_from=avail,
            property_description=None,
            amenities=None,
            source_url=url,
            scraped_at=now
        ))
        
    return results

async def _run_async(properties: list[dict]):
    async with httpx.AsyncClient(headers=HEADERS) as client:
        all_listings = []
        for url in APPFOLIO_MASTER_URLS:
            console.print(f"[cyan]Scraping AppFolio Master: {url}[/]")
            listings = await _scrape_appfolio_master(client, url, properties)
            if listings:
                all_listings.extend(listings)
            console.print(f"  -> Found {len(listings)} matching listings")
            
        if all_listings:
            for l in all_listings:
                availability.annotate(l)
            by_property: dict[int, list] = {}
            for l in all_listings:
                by_property.setdefault(l.property_id, []).append(l)
            with db.db_conn() as conn:
                for pid, listings in by_property.items():
                    db.insert_units_snapshot(conn, pid, listings, source="appfolio-master")
            console.print(f"[bold green]Saved {len(all_listings)} units from AppFolio portals.[/]")

def run():
    with db.db_conn() as conn:
        rows = conn.execute("SELECT id, building_name, address FROM properties").fetchall()
    properties = [dict(r) for r in rows]
    asyncio.run(_run_async(properties))

if __name__ == "__main__":
    run()
