"""Compute per-building affordable-unit qualification info.

Joins each affordable building's AMI-by-bedroom data against the official
rent & income limit schedules to answer, per building: what does an
affordable unit rent for, and what household income qualifies — the same
numbers leasing offices quote (e.g. "1BR $1,233/mo at 40% AMI, max income
$46,040 for a household of 1").

Schedule selection: MHA and IZ units always follow the MILU schedule.
MFTE units follow the schedule for their program phase, which the city
data doesn't state directly — it is estimated from the exemption's
12-year term (expiration year − 12 = approval year; P6 opened 2021,
P7 opened 2024; earlier phases follow MILU).
"""

import re
from datetime import datetime, timezone

from rich.console import Console

import db
from models import UnitQualification

console = Console()

BEDROOMS = [
    ("Micro", "micro_ami", "0-Bedroom"),
    ("Studio", "studio_ami", "0-Bedroom"),
    ("1-Bedroom", "one_br_ami", "1-Bedroom"),
    ("2-Bedroom", "two_br_ami", "2-Bedroom"),
    ("3-Bedroom", "three_br_ami", "3-Bedroom"),
]


def _parse_amis(s: str) -> list[int]:
    return [int(m) for m in re.findall(r"(\d{2,3})\s*%", s or "")]


def _mfte_schedule(expiration: str) -> str:
    m = re.search(r"(\d{4})\s*\(MFTE\)", expiration or "") or re.match(
        r"\s*(\d{4})", expiration or ""
    )
    if not m:
        return "MILU"
    approval_year = int(m.group(1)) - 12
    if approval_year >= 2025:
        return "MFTE_P7"
    if approval_year >= 2021:
        return "MFTE_P6"
    return "MILU"  # P3-P5 follow the MILU schedule


def run() -> None:
    db.init_db()
    now = datetime.now(timezone.utc).isoformat()

    with db.db_conn() as conn:
        buildings = conn.execute("SELECT * FROM affordable_buildings").fetchall()
        rents = {
            (r["program"], r["unit_size"], r["ami_pct"]): r["max_rent"]
            for r in conn.execute("SELECT * FROM rent_limits")
        }
        incomes = {
            (r["program"], r["ami_pct"], r["family_size"]): r["max_income"]
            for r in conn.execute("SELECT * FROM income_limits")
        }

        if not buildings:
            console.print("[red]No affordable buildings in DB — run `affordable` first.[/]")
            return
        if not rents:
            console.print("[red]No rent limits in DB — run `rentlimits` first.[/]")
            return

        quals: list[UnitQualification] = []
        missing_rent = 0
        for b in buildings:
            programs = []
            if b["has_mfte"]:
                programs.append(("MFTE", _mfte_schedule(b["expiration_date"])))
            if b["has_iz"]:
                programs.append(("IZ", "MILU"))
            if b["has_mha"]:
                programs.append(("MHA", "MILU"))

            for bedroom, ami_field, unit_size in BEDROOMS:
                for ami in _parse_amis(b[ami_field]):
                    for program, schedule in programs:
                        max_rent = rents.get((schedule, unit_size, ami))
                        if max_rent is None:
                            missing_rent += 1
                        quals.append(UnitQualification(
                            building_id=b["id"],
                            property_id=b["property_id"],
                            building_name=b["building_name"],
                            bedroom=bedroom,
                            program=program,
                            rent_schedule=schedule,
                            ami_pct=ami,
                            max_rent=max_rent,
                            income_limit_1=incomes.get((schedule, ami, 1)),
                            income_limit_2=incomes.get((schedule, ami, 2)),
                            income_limit_3=incomes.get((schedule, ami, 3)),
                            income_limit_4=incomes.get((schedule, ami, 4)),
                            computed_at=now,
                        ))

        db.replace_unit_qualifications(conn, quals)

    n_bldgs = len({q.building_id for q in quals})
    n_mha = sum(1 for q in quals if q.program == "MHA")
    console.print(
        f"[bold green]Done.[/] {len(quals)} qualification rows computed "
        f"for {n_bldgs} buildings ({n_mha} MHA rows)."
    )
    if missing_rent:
        console.print(
            f"[yellow]{missing_rent} rows have an AMI level with no matching "
            f"rent-limit entry (max_rent left empty).[/]"
        )
