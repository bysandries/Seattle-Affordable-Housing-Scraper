"""Statewide tax-credit (LIHTC) properties, covering all Washington counties.

Two sources, because neither is complete on its own:

* WSHFC publishes the richer file — AMI bands, unit mix, county, management
  company and, for about half the portfolio, a project website that the
  per-site scraper can then check for live availability. It has no coordinates.
* HUD's Resource Locator covers the same portfolio *with* geometry.

They are joined on a normalized address so statewide properties land on the map.
The ingest is non-destructive: a building already known from the Seattle dataset
or the AppFolio listings is left alone rather than duplicated or overwritten.
"""

import hashlib
import io
import re
from datetime import datetime, timezone

import httpx
import pandas as pd
from rich.console import Console

import db
from addresses import address_key
from config import HEADERS, HUD_LIHTC_FEATURE_URL, WSHFC_PROPERTY_LIST_URL
from models import WshfcProperty

console = Console()

# Positive ids above every county parcel number in the Seattle dataset (max
# ~9.8e9) and clear of the negative space the AppFolio ingest uses.
_ID_BASE = 10**12

_AMI_COLUMNS = [
    ("LIH 30%", 30), ("LIH 35%", 35), ("LIH 40%", 40),
    ("LIH 45%", 45), ("LIH 50%", 50), ("LIH 60%", 60),
]

_BEDROOM_COLUMNS = [
    ("0BR", "Studio"), ("1BR", "1-Bedroom"), ("2BR", "2-Bedroom"),
    ("3BR", "3-Bedroom"), ("4BR", "4-Bedroom"), ("5BR", "5-Bedroom"),
]


def _property_id(unique_id: str, address: str) -> int:
    digest = hashlib.sha1(f"wshfc:{unique_id}:{address}".encode()).hexdigest()[:12]
    return _ID_BASE + int(digest, 16) % 10**11


def _clean(value) -> str:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    return str(value).strip()


def _int(value) -> int | None:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _normalize_website(raw: str) -> str:
    """WSHFC records bare hosts, and occasionally a typo'd TLD."""
    site = _clean(raw)
    if not site or site.lower() in {"n/a", "none", "na"}:
        return ""
    if not re.match(r"^https?://", site, re.I):
        site = "http://" + site.lstrip("/")
    return site


def _ami_summary(row) -> str:
    """The AMI bands this property actually sets aside units at."""
    present = [pct for col, pct in _AMI_COLUMNS if (_int(row.get(col)) or 0) > 0]
    if not present:
        return ""
    if len(present) == 1:
        return f"{present[0]}%"
    return f"{min(present)}-{max(present)}%"


def _bedroom_types(row) -> str:
    return ", ".join(label for col, label in _BEDROOM_COLUMNS if (_int(row.get(col)) or 0) > 0)


def _fetch_wshfc() -> pd.DataFrame:
    console.print(f"[cyan]Fetching WSHFC property list…[/]")
    res = httpx.get(WSHFC_PROPERTY_LIST_URL, headers=HEADERS, follow_redirects=True, timeout=120)
    res.raise_for_status()
    df = pd.read_excel(io.BytesIO(res.content))
    console.print(f"  -> {len(df)} properties across {df['County'].nunique()} counties")
    return df


def _fetch_hud_coordinates() -> dict[str, tuple[float, float]]:
    """address key -> (lat, long) for Washington LIHTC properties."""
    console.print("[cyan]Fetching HUD LIHTC coordinates…[/]")
    coords: dict[str, tuple[float, float]] = {}
    offset = 0
    with httpx.Client(headers=HEADERS, timeout=90) as client:
        while True:
            res = client.get(
                HUD_LIHTC_FEATURE_URL,
                params={
                    "where": "PROJ_ST='WA'",
                    "outFields": "PROJ_ADD,PROJ_CTY",
                    "returnGeometry": "true",
                    "outSR": 4326,
                    "resultOffset": offset,
                    "resultRecordCount": 1000,
                    "f": "json",
                },
            )
            res.raise_for_status()
            features = res.json().get("features", [])
            if not features:
                break
            for f in features:
                geom = f.get("geometry") or {}
                lat, long_ = geom.get("y"), geom.get("x")
                attrs = f.get("attributes", {})
                addr = attrs.get("PROJ_ADD")
                if not (lat and long_ and addr):
                    continue
                coords.setdefault(address_key(addr, attrs.get("PROJ_CTY")), (lat, long_))
            offset += len(features)
    console.print(f"  -> {len(coords)} geocoded HUD records")
    return coords


def run() -> None:
    db.init_db()
    df = _fetch_wshfc()
    coords = _fetch_hud_coordinates()
    now = datetime.now(timezone.utc).isoformat()

    props: list[WshfcProperty] = []
    matched = 0
    for _, row in df.iterrows():
        address = _clean(row.get("Address"))
        city = _clean(row.get("City"))
        name = _clean(row.get("Project Name")) or address
        if not address or not city:
            continue

        restricted = _int(row.get("# of Restricted Units"))
        market = _int(row.get("# of Market Rate Units")) or 0
        # Reuses the taxonomy the Seattle dataset already established, so the
        # existing program filters keep working statewide.
        program = "Mixed Market and Affordable" if market > 0 else "Fully Affordable"

        key = address_key(address, city)
        lat, long_ = coords.get(key, (None, None))
        if lat:
            matched += 1

        props.append(WshfcProperty(
            id=_property_id(_clean(row.get("WSHFC Unique ID #")), address),
            building_name=name,
            address=address,
            city=city,
            county=_clean(row.get("County")),
            state="WA",
            program=program,
            total_units=_int(row.get("TOTAL Units")),
            income_restricted_units=restricted,
            amis=_ami_summary(row),
            br_types=_bedroom_types(row),
            expiration_date=_clean(row.get("Contract Expiration Date"))[:10],
            owner_management=_clean(row.get("Property Management Company")),
            phone=_clean(row.get("Project Phone Number")),
            website=_normalize_website(row.get("Project Website")),
            lat=lat,
            long=long_,
            last_fetched_at=now,
        ))

    console.print(f"  -> {matched}/{len(props)} matched to HUD coordinates")

    # WSHFC names the county for every row, which is the only place in the
    # pipeline that mapping exists — the AppFolio listings only ever give a city.
    city_to_county: dict[str, str] = {}
    for p in props:
        if p.county and p.city:
            city_to_county.setdefault(p.city.strip().lower(), p.county)

    with db.db_conn() as conn:
        skip_keys = db.existing_address_keys(conn, exclude_source="wshfc")
        inserted, updated, skipped = db.upsert_wshfc_properties(conn, props, skip_keys)
        filled = db.backfill_counties(conn, city_to_county)

    console.print(
        f"[bold green]WSHFC: {inserted} added, {updated} refreshed, "
        f"{skipped} skipped (already known from another source).[/]"
    )
    console.print(f"[green]Counties backfilled from city for {filled} other properties.[/]")


if __name__ == "__main__":
    run()
