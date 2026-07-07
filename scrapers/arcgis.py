"""Fetch all Seattle affordable housing properties from the ArcGIS FeatureServer."""

from datetime import datetime, timezone

import httpx
from rich.console import Console
from rich.progress import track

import db
from config import ARCGIS_FEATURE_URL, HEADERS, REQUEST_TIMEOUT
from models import Property

console = Console()


def _parse_property(attrs: dict) -> Property:
    bname = attrs.get("Building_Name") or ""
    website = attrs.get("Website") or ""
    
    if "arboreal" in bname.lower() and "tod" in bname.lower():
        website = "https://arboreal.management/properties/tod-apartments"
        
    return Property(
        id=attrs["ID"],
        building_name=bname,
        address=attrs.get("Address") or "",
        neighborhood=attrs.get("Neighborhood") or "",
        program=attrs.get("Program") or "",
        owner_management=attrs.get("Building_Owner_or_Management") or "",
        phone=attrs.get("Phone_Number") or "",
        website=website,
        total_units=attrs.get("Total_Units") or 0,
        income_restricted_units=attrs.get("Total_Income_Restricted_Units") or 0,
        amis=attrs.get("AMIs") or "",
        br_types=attrs.get("BR_Types") or "",
        expiration_date=attrs.get("Expiration_Date") or "",
        lat=attrs.get("Lat") or 0.0,
        long=attrs.get("Long") or 0.0,
        last_fetched_at=datetime.now(timezone.utc).isoformat(),
    )


def fetch_all_properties() -> list[Property]:
    params = {
        "where": "1=1",
        "outFields": "*",
        "returnGeometry": "false",
        "f": "json",
        "resultRecordCount": 2000,
    }

    console.print("[bold cyan]Fetching properties from ArcGIS FeatureServer...[/]")

    with httpx.Client(timeout=REQUEST_TIMEOUT, headers=HEADERS) as client:
        resp = client.get(ARCGIS_FEATURE_URL, params=params)
        resp.raise_for_status()
        data = resp.json()

    features = data.get("features", [])
    if not features:
        raise RuntimeError(f"No features returned. Response: {data}")

    properties = [_parse_property(f["attributes"]) for f in features]
    console.print(f"[green]Fetched {len(properties)} properties.[/]")
    return properties


def run() -> None:
    db.init_db()
    properties = fetch_all_properties()

    with db.db_conn() as conn:
        for prop in track(properties, description="Saving to database..."):
            db.upsert_property(conn, prop)

    console.print(f"[bold green]Done. {len(properties)} properties saved to database.[/]")
