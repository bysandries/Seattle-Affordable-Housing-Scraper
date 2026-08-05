"""
Scrape master AppFolio property management pages directly to capture units
across all their buildings and map them to our properties database.
"""

import asyncio
import hashlib
import json
import re
from datetime import datetime, timezone
from html import unescape
from urllib.parse import urljoin

import httpx
from bs4 import BeautifulSoup
from rich.console import Console

import availability
import db
from config import HEADERS, APPFOLIO_MASTER_URLS, PROPERTY_SITE_OVERRIDES
from models import AppfolioProperty, UnitListing
from scrapers.property_scraper import _normalize_unit_type

console = Console()

# Portals embed a `markers: [...]` array for their map view, carrying lat/long,
# full address and the same listing_id the cards use. That is the only place
# coordinates appear, so statewide properties are geocoded straight from it.
MARKERS_RE = re.compile(r"markers\s*:\s*(\[.*?\])\s*[,}]", re.S)

# "<street>, <City>, <ST> <zip>" — the unit-number segment between street and
# city is numeric, so requiring letters in the city group skips past it.
CITY_STATE_RE = re.compile(r",\s*([A-Za-z][A-Za-z .'-]+),\s*([A-Z]{2})\b")

STATEWIDE_SOURCE = "appfolio-statewide"


def _extract_street_num(address: str) -> str | None:
    m = re.search(r"^(\d+)", address.strip())
    return m.group(1) if m else None


# Street types and directionals carry no identifying information — "4301 Stone
# Way N" and "4301 Alderwood Mall Boulevard" would otherwise look similar just
# by sharing "way"/"n"-style tokens.
_GENERIC_STREET_WORDS = {
    "st", "street", "ave", "av", "avenue", "rd", "road", "blvd", "boulevard",
    "dr", "drive", "ln", "lane", "way", "pl", "place", "ct", "court", "cir",
    "circle", "ter", "terrace", "pkwy", "parkway", "hwy", "highway", "loop",
    "trl", "trail", "sq", "square",
    "n", "s", "e", "w", "ne", "nw", "se", "sw", "north", "south", "east", "west",
    "apt", "unit", "ste", "suite", "bldg", "building", "no",
}


def _street_words(address: str) -> set[str]:
    """Identifying words of a street address: no number, no street type."""
    street = address.split(",")[0].lower()
    words = re.findall(r"[a-z0-9]+", street)
    return {w for w in words if w not in _GENERIC_STREET_WORDS and not w.isdigit()}


def _street_directionals(address: str) -> set[str]:
    """Compass parts of a street, canonicalised ("North" and "N" are one)."""
    street = address.split(",")[0].lower()
    return {
        _DIRECTIONALS[w]
        for w in re.findall(r"[a-z]+", street)
        if w in _DIRECTIONALS
    }


def _parse_markers(html: str) -> dict[str, dict]:
    """listing_id -> marker dict (latitude, longitude, address, ...)."""
    m = MARKERS_RE.search(html)
    if not m:
        return {}
    try:
        return {str(mk["listing_id"]): mk for mk in json.loads(m.group(1)) if "listing_id" in mk}
    except (ValueError, TypeError):
        return {}


def _split_city_state(address: str) -> tuple[str | None, str | None]:
    m = CITY_STATE_RE.search(address or "")
    if not m:
        return None, None
    return m.group(1).strip().title(), m.group(2).upper()


# A US street address runs "<number> <name> <type> [<directional>]". Anything
# after that is a unit designator, however the manager chose to write it.
# Recognising where the address proper ends is what lets "600 Black Lake Blvd SW
# 97", "600 Black Lake Blvd SW 43" and "4046 8th Ave NE type" collapse onto
# their buildings — none of which carry a "#", "Unit" or "-" marker to key off.
_STREET_TYPE_CANON = {
    "st": "st", "street": "st",
    "ave": "ave", "av": "ave", "avenue": "ave",
    "rd": "rd", "road": "rd",
    "blvd": "blvd", "boulevard": "blvd",
    "dr": "dr", "drive": "dr",
    "ln": "ln", "lane": "ln",
    "pl": "pl", "place": "pl",
    "ct": "ct", "court": "ct",
    "cir": "cir", "circle": "cir",
    "ter": "ter", "terrace": "ter",
    "pkwy": "pkwy", "parkway": "pkwy",
    "hwy": "hwy", "highway": "hwy",
    "way": "way", "wy": "way",
    "trl": "trl", "trail": "trl",
    "sq": "sq", "square": "sq",
    "loop": "loop",
}

_DIRECTIONALS = {
    "n": "n", "s": "s", "e": "e", "w": "w",
    "ne": "ne", "nw": "nw", "se": "se", "sw": "sw",
    "north": "n", "south": "s", "east": "e", "west": "w",
    "northeast": "ne", "northwest": "nw", "southeast": "se", "southwest": "sw",
}


def _street_tokens(street: str) -> list[str]:
    """Split a street into words, dropping the punctuation portals sprinkle in."""
    return [t for t in re.split(r"[\s,]+", street.replace(".", " ").strip()) if t]


def _truncate_at_street_type(tokens: list[str]) -> list[str] | None:
    """Keep through the last street type plus a trailing directional.

    Returns None when no street type is present, since then there is no
    reliable boundary and guessing would merge distinct buildings.
    """
    last = None
    for i, t in enumerate(tokens):
        if t.lower().strip("#-") in _STREET_TYPE_CANON:
            last = i
    if last is None:
        return None
    end = last + 1
    if end < len(tokens) and tokens[end].lower().strip("#-") in _DIRECTIONALS:
        end += 1
    return tokens[:end]


def _clean_street(address: str) -> str:
    """The street portion of an address, minus any unit designator.

    Listings at one building differ only by that designator, so stripping it is
    what collapses them to a single building.
    """
    street = unescape(address.split(",")[0])
    tokens = _street_tokens(street)
    truncated = _truncate_at_street_type(tokens)
    if truncated is not None:
        return " ".join(truncated)

    # No recognisable street type — fall back to the explicit designator forms.
    # "#" cannot follow \b, since it is not a word character.
    street = re.sub(r"\s*[-–]\s*(?=[\w/-]*\d)[\w/-]+\s*$", "", street)
    street = re.sub(r"(?:\b(?:apt|unit|ste|suite|bldg)\b|#)\s*[\w-]+\s*$", "", street, flags=re.I)
    return re.sub(r"\s{2,}", " ", street).strip(" ,-#")


def _normalize_street_for_key(street: str) -> str:
    """Spelling-independent form, so "Ave." and "Avenue" identify one building."""
    out = []
    for t in _street_tokens(street.lower()):
        t = re.sub(r"[^a-z0-9]", "", t)
        if not t:
            continue
        out.append(_STREET_TYPE_CANON.get(t) or _DIRECTIONALS.get(t) or t)
    return " ".join(out)


def _building_key(address: str) -> str:
    """Identity of the building a unit-level address belongs to."""
    city, state = _split_city_state(address)
    return f"{_normalize_street_for_key(_clean_street(address))}|{(city or '').lower()}|{state or ''}"


def _property_id_for(key: str) -> int:
    """Stable negative id derived from the building key.

    Negative because every id in the Seattle Office of Housing dataset is a
    positive parcel number, so the two spaces can never collide.
    """
    digest = hashlib.sha1(key.encode()).hexdigest()[:12]
    return -(int(digest, 16) % 10**11 + 1)

def _fuzzy_match_property(appfolio_address: str, properties: list[dict]) -> int | None:
    if not appfolio_address:
        return None
    
    # Every property in the Seattle dataset is in Seattle, and its stored
    # address carries no city. A listing that names a different city therefore
    # cannot be one of them — without this check a street number alone was
    # enough to attach, so e.g. "4301 Alderwood Mall Blvd, Lynnwood" landed on
    # "4301 Stone Way N" in Seattle.
    city, _state = _split_city_state(appfolio_address)
    if city and city.lower() != "seattle":
        return None

    appfolio_address_lower = appfolio_address.lower()
    street_num = _extract_street_num(appfolio_address_lower)
    if not street_num:
        return None

    candidates = [p for p in properties if _extract_street_num(p["address"].lower()) == street_num]
    if not candidates:
        return None

    # The street number alone is not identifying, even within Seattle.
    appfolio_words = _street_words(appfolio_address)
    appfolio_dir = _street_directionals(appfolio_address)
    if appfolio_words:
        for c in candidates:
            if not (appfolio_words & _street_words(c["address"])):
                continue
            # Directionals are dropped from the word comparison as noise, but
            # they distinguish real streets: 8th Ave NE is not 8th Ave SW.
            candidate_dir = _street_directionals(c["address"])
            if appfolio_dir and candidate_dir and not (appfolio_dir & candidate_dir):
                continue
            return c["id"]
        return None

    # No distinguishing words on the listing side (e.g. a bare number): fall
    # back to the old behaviour, but only when the number is unambiguous.
    return candidates[0]["id"] if len(candidates) == 1 else None

async def _scrape_appfolio_master(
    client: httpx.AsyncClient, url: str, properties: list[dict], now: str | None = None
) -> tuple[list[UnitListing], list[UnitListing], dict[int, AppfolioProperty]]:
    """Scrape one portal.

    Returns (matched, statewide, statewide_properties). `matched` are units for
    buildings already in the Seattle Office of Housing dataset. `statewide` are
    Washington listings from that same portal that match no such building — they
    get synthesized properties of their own so the app can show the rest of the
    state, not just Seattle.
    """
    try:
        res = await client.get(url, follow_redirects=True, timeout=30)
        res.raise_for_status()
    except Exception as e:
        console.print(f"[red]Failed to fetch {url}: {e}[/]")
        return [], [], {}

    markers = _parse_markers(res.text)
    soup = BeautifulSoup(res.text, "lxml")
    listings = soup.find_all("div", class_=lambda c: c and "listing-item" in c)
    if not listings:
        listings = soup.find_all("article")

    results: list[UnitListing] = []
    statewide: list[UnitListing] = []
    statewide_props: dict[int, AppfolioProperty] = {}
    br_types: dict[int, set[str]] = {}
    now = now or datetime.now(timezone.utc).isoformat()
    seen_listing_ids: set[str] = set()

    for div in listings:
        # AppFolio renders desktop and mobile variants of the same listing, so
        # dedupe on the stable per-listing id before doing any parsing.
        listing_id = None
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

        # Deep link to this specific apartment. The anchor carrying
        # data-listing-id has href="#" (it drives a JS handler), so the real
        # target is the marker's detail_page_url, with any /listings/detail/
        # anchor inside the card as a fallback.
        marker = markers.get(listing_id) if listing_id else None
        listing_url = None
        if marker and marker.get("detail_page_url"):
            listing_url = urljoin(url, marker["detail_page_url"])
        else:
            detail_a = div.find("a", href=re.compile(r"/listings/detail/", re.I))
            if detail_a:
                listing_url = urljoin(url, detail_a["href"])

        if property_id:
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
                listing_url=listing_url,
                scraped_at=now
            ))
            continue

        # No Seattle-dataset match: keep it as its own statewide property, but
        # only with coordinates (the map filters on lat/long) and only in WA.
        if not marker:
            continue
        full_address = marker.get("address") or address
        city, state = _split_city_state(full_address)
        lat, long_ = marker.get("latitude"), marker.get("longitude")
        if state != "WA" or not city or not lat or not long_:
            continue

        key = _building_key(full_address)
        pid = _property_id_for(key)
        if pid not in statewide_props:
            # Deliberately not the listing title — those are per-unit marketing
            # copy ("UP TO $1,200 OFF Top Floor Studio"), which would be both
            # wrong for the building and unstable between runs.
            street = _clean_street(full_address)
            statewide_props[pid] = AppfolioProperty(
                id=pid,
                building_name=street,
                address=f"{street}, {city}, {state}",
                city=city,
                state=state,
                # The manager's own site, not a single apartment's detail page —
                # individual units carry their own deep link in listing_url.
                website=PROPERTY_SITE_OVERRIDES.get(key) or url,
                br_types="",
                lat=float(lat),
                long=float(long_),
                last_fetched_at=now,
            )
            br_types[pid] = set()
        if unit_type != "unknown":
            br_types[pid].add(unit_type)

        statewide.append(UnitListing(
            property_id=pid,
            unit_type=unit_type,
            sqft=sqft,
            rent_min=rent_min,
            rent_max=rent_max,
            available_count=None,
            available_from=avail,
            property_description=None,
            amenities=None,
            source_url=url,
            listing_url=listing_url,
            scraped_at=now
        ))

    for pid, types in br_types.items():
        statewide_props[pid].br_types = ", ".join(sorted(types))

    return results, statewide, statewide_props

def _save(conn, listings: list[UnitListing], source: str) -> None:
    by_property: dict[int, list] = {}
    for l in listings:
        availability.annotate(l)
        by_property.setdefault(l.property_id, []).append(l)
    for pid, rows in by_property.items():
        db.insert_units_snapshot(conn, pid, rows, source=source)


async def _run_async(properties: list[dict]):
    # One timestamp for the whole run, so rows this run did not rewrite are
    # identifiable as stale afterwards.
    run_ts = datetime.now(timezone.utc).isoformat()
    async with httpx.AsyncClient(headers=HEADERS) as client:
        all_listings: list[UnitListing] = []
        all_statewide: list[UnitListing] = []
        all_props: dict[int, AppfolioProperty] = {}
        for url in APPFOLIO_MASTER_URLS:
            console.print(f"[cyan]Scraping AppFolio Master: {url}[/]")
            listings, statewide, props = await _scrape_appfolio_master(client, url, properties, run_ts)
            all_listings.extend(listings)
            all_statewide.extend(statewide)
            # First portal to advertise a building wins; later ones would only
            # restate the same address.
            for pid, p in props.items():
                all_props.setdefault(pid, p)
            console.print(
                f"  -> {len(listings)} matching listings"
                f"  |  {len(statewide)} statewide in {len(props)} buildings"
            )

        with db.db_conn() as conn:
            if all_listings:
                _save(conn, all_listings, "appfolio-master")
            stale = db.demote_stale_units(conn, "appfolio-master", run_ts)
            stale += db.demote_stale_units(conn, STATEWIDE_SOURCE, run_ts)
            if stale:
                console.print(f"[yellow]Demoted {stale} rows no longer advertised.[/]")
            if all_props:
                # Properties must exist before their units reference them.
                upserted, deleted = db.replace_appfolio_properties(conn, list(all_props.values()))
                _save(conn, all_statewide, STATEWIDE_SOURCE)
                console.print(
                    f"[bold green]Statewide: {upserted} properties "
                    f"({deleted} stale removed), {len(all_statewide)} units.[/]"
                )
        console.print(f"[bold green]Saved {len(all_listings)} units from AppFolio portals.[/]")

def run():
    db.init_db()
    with db.db_conn() as conn:
        # Match only against the Seattle dataset. Properties synthesized by a
        # previous statewide run must not absorb listings themselves, or the
        # two ingest paths would fight over the same rows.
        rows = conn.execute(
            "SELECT id, building_name, address FROM properties "
            "WHERE IFNULL(data_source, 'seattle_oh') != 'appfolio'"
        ).fetchall()
    properties = [dict(r) for r in rows]
    asyncio.run(_run_async(properties))

if __name__ == "__main__":
    run()
