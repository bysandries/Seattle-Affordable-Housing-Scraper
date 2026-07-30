"""Fetch market-rate buildings with affordable units (MFTE / IZ / MHA).

Source: Seattle Office of Housing ArcGIS layer with per-building unit counts
and AMI levels per bedroom size for the MFTE (Multifamily Tax Exemption),
IZ (Incentive Zoning), and MHA (Mandatory Housing Affordability) programs.
Each row is matched back to the main `properties` table by normalized address
(falling back to building name) so the two datasets join.
"""

import re
from datetime import datetime, timezone

import httpx
from rich.console import Console

import db
from config import AFFORDABLE_UNITS_FEATURE_URL, HEADERS, REQUEST_TIMEOUT
from models import AffordableBuilding

console = Console()


def _norm(s: str) -> str:
    """Normalize an address or name for matching: lowercase, collapse space, strip punctuation."""
    s = s.lower().strip()
    s = re.sub(r"[.,#]", " ", s)
    s = re.sub(r"\s+", " ", s)
    # common street-suffix variants
    replacements = {
        " avenue": " ave", " street": " st", " boulevard": " blvd",
        " place": " pl", " drive": " dr", " road": " rd", " way ": " wy ",
        " southwest": " sw", " northwest": " nw", " southeast": " se",
        " northeast": " ne", " south ": " s ", " north ": " n ",
        " east ": " e ", " west ": " w ",
    }
    s = f" {s} "
    for full, abbr in replacements.items():
        s = s.replace(f"{full} ", f"{abbr} ")
    return s.strip()


def _parse_feature(attrs: dict) -> AffordableBuilding:
    return AffordableBuilding(
        building_name=attrs.get("Building_Name") or "",
        address=attrs.get("Address") or "",
        neighborhood=attrs.get("Neighborhood") or "",
        phone=attrs.get("Phone_Number") or "",
        website=attrs.get("Website") or "",
        total_units=attrs.get("Total_Units") or 0,
        total_mfte_units=attrs.get("Total_MFTE_Units") or 0,
        total_iz_units=attrs.get("Total_IZ_Units") or 0,
        total_mha_units=attrs.get("Total_MHA_Units") or 0,
        total_affordable_units=attrs.get("Total_Affordable_Units") or 0,
        expiration_date=attrs.get("Expiration_Date") or "",
        micro_ami=attrs.get("Micro_Units_AMI") or "",
        studio_ami=attrs.get("Studio_Unit_AMI") or "",
        one_br_ami=attrs.get("One_Bedroom_AMI") or "",
        two_br_ami=attrs.get("Two_Bedroom_AMI") or "",
        three_br_ami=attrs.get("Three_Bedroom_AMI") or "",
        amis=attrs.get("AMIs") or "",
        br_types=attrs.get("BR_Types") or "",
        has_mfte=(attrs.get("MFTE") or "").strip().lower() == "yes",
        has_iz=(attrs.get("IZ") or "").strip().lower() == "yes",
        has_mha=(attrs.get("MHA") or "").strip().lower() == "yes",
        lat=attrs.get("Lat") or 0.0,
        long=attrs.get("Long") or 0.0,
        last_fetched_at=datetime.now(timezone.utc).isoformat(),
    )


def fetch_affordable_buildings() -> list[AffordableBuilding]:
    params = {
        "where": "1=1",
        "outFields": "*",
        "returnGeometry": "false",
        "f": "json",
        "resultRecordCount": 2000,
    }

    console.print("[bold cyan]Fetching MFTE/IZ/MHA buildings from ArcGIS...[/]")

    with httpx.Client(timeout=REQUEST_TIMEOUT, headers=HEADERS) as client:
        resp = client.get(AFFORDABLE_UNITS_FEATURE_URL, params=params)
        resp.raise_for_status()
        data = resp.json()

    features = data.get("features", [])
    if not features:
        raise RuntimeError(f"No features returned. Response: {data}")

    props = [_parse_feature(f["attributes"]) for f in features]
    console.print(f"[green]Fetched {len(props)} buildings with affordable units.[/]")
    return props


def _match_property_ids(conn, props: list[AffordableBuilding]) -> int:
    """Link affordable buildings to the main properties table by address, then name."""
    rows = db.get_all_properties(conn)
    by_address = {}
    by_name = {}
    for r in rows:
        if r["address"]:
            by_address.setdefault(_norm(r["address"]), r["id"])
        if r["building_name"]:
            by_name.setdefault(_norm(r["building_name"]), r["id"])

    matched = 0
    for p in props:
        pid = by_address.get(_norm(p.address)) if p.address else None
        if pid is None and p.building_name:
            pid = by_name.get(_norm(p.building_name))
        if pid is not None:
            p.property_id = pid
            matched += 1
    return matched


def run() -> None:
    db.init_db()
    props = fetch_affordable_buildings()

    with db.db_conn() as conn:
        matched = _match_property_ids(conn, props)
        db.replace_affordable_buildings(conn, props)

    mfte = sum(p.total_mfte_units for p in props)
    iz = sum(p.total_iz_units for p in props)
    mha = sum(p.total_mha_units for p in props)
    mha_bldgs = sum(1 for p in props if p.has_mha)
    console.print(
        f"[bold green]Done.[/] {len(props)} buildings saved "
        f"({matched} matched to main properties table)."
    )
    console.print(
        f"  Units — MFTE: {mfte}  |  IZ: {iz}  |  MHA: {mha} "
        f"(across {mha_bldgs} MHA buildings)"
    )
