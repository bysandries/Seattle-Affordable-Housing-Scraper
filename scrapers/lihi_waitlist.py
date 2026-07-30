"""Scrape LIHI waitlist status from their single properties index page.

The Low Income Housing Institute operates ~37 of the buildings in this dataset.
Their buildings are fully affordable, so "availability" is expressed as waitlist
status ("Waitlist Open July 27th, 2026!", "Waitlist Closed 6/5/2026") rather
than per-unit vacancy dates.

All buildings are listed on one server-rendered page, so a single request covers
the whole portfolio. Each building's status appears immediately before its name
in document order, so we anchor on the building names we already know from the
properties table and read backwards.
"""

import re
from datetime import datetime, timezone

import httpx
from bs4 import BeautifulSoup
from rich.console import Console

import availability
import db
from config import HEADERS, REQUEST_TIMEOUT
from models import UnitListing

console = Console()

INDEX_URL = "https://www.lihihousing.org/properties"
# Status phrases run from the word "waitlist" up to the building name that
# follows, e.g. "Waitlist Open July 27th, 2026!" then "Bart Harvey".
STATUS_START_RE = re.compile(r"wait\s?list", re.IGNORECASE)
# How far back from a building name to look for its status phrase.
LOOKBEHIND = 90


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9 ]", " ", (s or "").lower())


# Words that carry no identifying information, so "The Frye" and "Frye Building"
# reduce to the same core name.
GENERIC_WORDS = {
    "the", "apartments", "apartment", "apts", "building", "bldg", "house",
    "housing", "court", "place", "commons", "tower", "towers", "lofts", "loft",
    "residences", "residence", "senior", "center", "centre", "studios", "homes",
    "village", "at", "of", "and",
}


def _core_name(s: str) -> str:
    tokens = [t for t in _norm(s).split() if t and t not in GENERIC_WORDS]
    return " ".join(tokens)


def fetch_index() -> str:
    with httpx.Client(timeout=REQUEST_TIMEOUT, headers=HEADERS, follow_redirects=True) as client:
        resp = client.get(INDEX_URL)
        resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "lxml")
    return re.sub(r"\s+", " ", soup.get_text(" ", strip=True))


def status_for(page_text: str, building_name: str) -> str | None:
    """Find the waitlist phrase immediately preceding `building_name`.

    Tries the full name first, then the name with generic words stripped so a
    listing titled "The Frye" still matches a property named "Frye Building".
    """
    # _norm preserves length (it only substitutes characters), so offsets found
    # in the normalized text map directly back onto the original.
    haystack = _norm(page_text)
    candidates = [n for n in (_norm(building_name).strip(), _core_name(building_name)) if len(n) >= 4]

    for name in dict.fromkeys(candidates):
        for m in re.finditer(rf"\b{re.escape(name)}\b", haystack):
            window = page_text[max(0, m.start() - LOOKBEHIND):m.start()]
            starts = list(STATUS_START_RE.finditer(window))
            if starts:
                status = window[starts[-1].start():]
                # Drop a trailing article left over when matching a core name.
                return re.sub(r"\s+(?:the|at)\s*$", "", status, flags=re.I).strip(" -–—:|")
    return None


def run() -> None:
    db.init_db()
    now = datetime.now(timezone.utc).isoformat()

    with db.db_conn() as conn:
        rows = conn.execute(
            """
            SELECT id, building_name FROM properties
            WHERE IFNULL(website,'') LIKE '%lihihousing%'
               OR IFNULL(website_discovered,'') LIKE '%lihihousing%'
            ORDER BY id
            """
        ).fetchall()

    if not rows:
        console.print("[yellow]No LIHI properties found in the properties table.[/]")
        return

    console.print(f"[bold cyan]Fetching LIHI waitlist index for {len(rows)} properties...[/]")
    page_text = fetch_index()

    matched = 0
    with db.db_conn() as conn:
        for r in rows:
            raw = status_for(page_text, r["building_name"])
            if not raw:
                continue
            iso, status = availability.normalize(raw, now)
            listing = UnitListing(
                property_id=r["id"],
                unit_type="unknown",
                sqft=None,
                rent_min=None,
                rent_max=None,
                available_count=None,
                available_from=raw,
                property_description=None,
                amenities=None,
                scraped_at=now,
                source_url=INDEX_URL,
                available_date=iso,
                availability_status=status,
            )
            db.insert_units_snapshot(conn, r["id"], [listing], source="lihi")
            matched += 1
            console.print(f"  {r['building_name']}: [green]{raw}[/]" + (f" -> {iso}" if iso else ""))

    console.print(
        f"[bold green]Done.[/] {matched}/{len(rows)} LIHI properties have a published "
        f"waitlist status."
    )
