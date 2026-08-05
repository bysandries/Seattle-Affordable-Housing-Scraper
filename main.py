"""
Seattle Affordable Housing Scraper — CLI entry point.

Usage:
    python main.py fetch              Pull all 742 properties from ArcGIS
    python main.py discover           Validate/discover property websites
    python main.py scrape             Scrape all property sites for availability
    python main.py scrape --limit 10  Scrape only 10 properties (for testing)
    python main.py wshfc              Fetch statewide LIHTC properties (all WA counties)
    python main.py affordable         Fetch MFTE/IZ/MHA buildings (unit counts + AMI levels)
                                      (aliases: mfte, mha)
    python main.py rentlimits         Fetch official MFTE/MHA income & rent limit schedules
    python main.py qualify            Recompute per-building qualification info (rents + income limits)
    python main.py pages              Scrape property websites for posted MFTE/MHA info & waitlists
    python main.py all                Run fetch + discover + scrape in sequence
    python main.py export             Export combined data to output/
"""

import argparse
import os
import sys

from rich.console import Console

console = Console()


def cmd_fetch(_args: argparse.Namespace) -> None:
    from scrapers.arcgis import run
    run()


def cmd_discover(args: argparse.Namespace) -> None:
    from scrapers.website_discovery import run
    run(only_with_website=getattr(args, "existing_only", False))


def cmd_scrape(args: argparse.Namespace) -> None:
    from scrapers.property_scraper import run
    run(limit=args.limit, source=getattr(args, "source", None))

def cmd_appfolio(_args: argparse.Namespace) -> None:
    from scrapers.appfolio_master import run
    run()


def cmd_wshfc(_args: argparse.Namespace) -> None:
    from scrapers.wshfc import run
    run()


def cmd_affordable(args: argparse.Namespace) -> None:
    from scrapers.affordable_units import run
    run()
    cmd_qualify(args)


def cmd_rentlimits(args: argparse.Namespace) -> None:
    from scrapers.rent_limits import run
    run()
    cmd_qualify(args)


def cmd_qualify(_args: argparse.Namespace) -> None:
    from qualifications import run
    run()


def cmd_lihi(_args: argparse.Namespace) -> None:
    from scrapers.lihi_waitlist import run
    run()


def cmd_pages(args: argparse.Namespace) -> None:
    from scrapers.affordable_pages import run
    run(limit=args.limit)


def cmd_all(args: argparse.Namespace) -> None:
    cmd_fetch(args)
    cmd_affordable(args)
    cmd_rentlimits(args)
    cmd_discover(args)
    cmd_appfolio(args)
    cmd_scrape(args)


def cmd_export(_args: argparse.Namespace) -> None:
    import re
    import sqlite3
    import db
    import pandas as pd
    from config import DB_PATH, OUTPUT_DIR

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    db.init_db()  # migrates older databases (mfte_properties -> affordable_buildings)

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    props = pd.read_sql_query("SELECT * FROM properties", conn)
    units = pd.read_sql_query("SELECT * FROM units", conn)
    affordable = pd.read_sql_query("SELECT * FROM affordable_buildings", conn)
    rent_limits = pd.read_sql_query("SELECT * FROM rent_limits", conn)
    quals = pd.read_sql_query("SELECT * FROM unit_qualifications", conn)
    page_info = pd.read_sql_query("SELECT * FROM affordable_page_info", conn)

    # Live availability: the current snapshot only, soonest first.
    live_avail = pd.read_sql_query(
        """
        SELECT p.building_name, p.address, p.neighborhood, p.program,
               u.unit_type, u.sqft, u.rent_min, u.rent_max,
               u.available_from AS availability_text,
               u.available_date, u.availability_status,
               u.source, u.source_url, u.scraped_at
        FROM units u
        JOIN properties p ON p.id = u.property_id
        WHERE u.is_current = 1 AND u.availability_status != 'unknown'
        ORDER BY
          CASE u.availability_status WHEN 'now' THEN 0 WHEN 'future' THEN 1 ELSE 2 END,
          u.available_date, p.building_name
        """,
        conn,
    )
    conn.close()

    # Merged view: one row per unit listing enriched with property info
    merged = units.merge(
        props[["id", "building_name", "address", "neighborhood", "amis", "br_types",
               "income_restricted_units", "website", "phone", "expiration_date"]],
        left_on="property_id",
        right_on="id",
        how="left",
    ).drop(columns=["id_y"]).rename(columns={"id_x": "unit_id"})

    # Long-format view: one row per building x program (MFTE / IZ / MHA), with
    # per-program expiration when the source annotates years like
    # "2037 (MFTE) 2097 (MHA)". MHA and IZ rents follow the MILU schedule.
    def _program_expiration(exp: str, program: str) -> str:
        tagged = {p: y for y, p in re.findall(r"(\d{4})\s*\((MFTE|IZ|MHA)\)", exp or "")}
        return tagged.get(program, exp or "")

    program_rows = []
    for r in affordable.itertuples():
        for program, count in (
            ("MFTE", r.total_mfte_units),
            ("IZ", r.total_iz_units),
            ("MHA", r.total_mha_units),
        ):
            if not count:
                continue
            program_rows.append({
                "building_name": r.building_name,
                "address": r.address,
                "neighborhood": r.neighborhood,
                "program": program,
                "affordable_units": count,
                "total_units": r.total_units,
                "amis": r.amis,
                "br_types": r.br_types,
                "expiration": _program_expiration(r.expiration_date, program),
                "rent_limit_schedule": "MILU" if program in ("IZ", "MHA") else "MFTE_P3-P7 (by phase)",
                "website": r.website,
                "phone": r.phone,
                "property_id": r.property_id,
            })
    by_program = pd.DataFrame(program_rows)

    csv_path = os.path.join(OUTPUT_DIR, "results.csv")
    json_path = os.path.join(OUTPUT_DIR, "results.json")
    props_csv = os.path.join(OUTPUT_DIR, "properties.csv")
    affordable_csv = os.path.join(OUTPUT_DIR, "affordable_buildings.csv")
    by_program_csv = os.path.join(OUTPUT_DIR, "affordable_units_by_program.csv")
    quals_csv = os.path.join(OUTPUT_DIR, "unit_qualifications.csv")
    page_info_csv = os.path.join(OUTPUT_DIR, "affordable_page_info.csv")
    limits_csv = os.path.join(OUTPUT_DIR, "rent_limits.csv")

    merged.to_csv(csv_path, index=False)
    merged.to_json(json_path, orient="records", indent=2)
    props.to_csv(props_csv, index=False)
    affordable.to_csv(affordable_csv, index=False)
    by_program.to_csv(by_program_csv, index=False)
    quals.to_csv(quals_csv, index=False)
    page_info.to_csv(page_info_csv, index=False)
    rent_limits.to_csv(limits_csv, index=False)
    live_csv = os.path.join(OUTPUT_DIR, "live_availability.csv")
    live_avail.to_csv(live_csv, index=False)

    n_mha = len(by_program[by_program["program"] == "MHA"]) if len(by_program) else 0
    console.print(f"[bold green]Exported:[/]")
    console.print(f"  {csv_path}  ({len(merged)} unit rows)")
    console.print(f"  {json_path}")
    console.print(f"  {props_csv}  ({len(props)} properties)")
    console.print(f"  {affordable_csv}  ({len(affordable)} MFTE/IZ/MHA buildings)")
    console.print(f"  {by_program_csv}  ({len(by_program)} building-program rows, {n_mha} MHA)")
    n_now = int((live_avail["availability_status"] == "now").sum()) if len(live_avail) else 0
    console.print(f"  {live_csv}  ({len(live_avail)} live units, {n_now} available now)")
    console.print(f"  {quals_csv}  ({len(quals)} qualification rows)")
    console.print(f"  {page_info_csv}  ({len(page_info)} website-info rows)")
    console.print(f"  {limits_csv}  ({len(rent_limits)} rent limit rows)")


def cmd_contact(_args: argparse.Namespace) -> None:
    console.print(
        "[bold red]Disabled for ethical reasons.[/] "
        "Automated form submission and chatbot spamming violates the 'Good Samaritan' "
        "scraping principles for this educational research project."
    )


def cmd_stats(_args: argparse.Namespace) -> None:
    import sqlite3
    from config import DB_PATH

    conn = sqlite3.connect(DB_PATH)
    props = conn.execute("SELECT COUNT(*) FROM properties").fetchone()[0]
    ok = conn.execute("SELECT COUNT(*) FROM properties WHERE website_status='ok'").fetchone()[0]
    unreachable = conn.execute("SELECT COUNT(*) FROM properties WHERE website_status='unreachable'").fetchone()[0]
    units = conn.execute("SELECT COUNT(*) FROM units").fetchone()[0]
    with_rent = conn.execute("SELECT COUNT(*) FROM units WHERE rent_min IS NOT NULL").fetchone()[0]

    def _count(sql: str) -> int:
        try:
            return conn.execute(sql).fetchone()[0]
        except sqlite3.OperationalError:
            return 0

    live = _count("SELECT COUNT(*) FROM units WHERE is_current=1")
    live_rent = _count("SELECT COUNT(*) FROM units WHERE is_current=1 AND rent_min IS NOT NULL")
    av_now = _count("SELECT COUNT(*) FROM units WHERE is_current=1 AND availability_status='now'")
    av_future = _count("SELECT COUNT(*) FROM units WHERE is_current=1 AND availability_status='future'")
    av_wait = _count("SELECT COUNT(*) FROM units WHERE is_current=1 AND availability_status='waitlist'")
    av_date = _count("SELECT COUNT(*) FROM units WHERE is_current=1 AND available_date IS NOT NULL")

    aff_bldgs = _count("SELECT COUNT(*) FROM affordable_buildings")
    mfte_units = _count("SELECT COALESCE(SUM(total_mfte_units),0) FROM affordable_buildings")
    mha_units = _count("SELECT COALESCE(SUM(total_mha_units),0) FROM affordable_buildings")
    mha_bldgs = _count("SELECT COUNT(*) FROM affordable_buildings WHERE has_mha=1")
    iz_units = _count("SELECT COALESCE(SUM(total_iz_units),0) FROM affordable_buildings")
    rent_limits = _count("SELECT COUNT(*) FROM rent_limits")
    quals = _count("SELECT COUNT(*) FROM unit_qualifications")
    pages_ok = _count("SELECT COUNT(*) FROM affordable_page_info WHERE status='ok'")
    pages_waitlist = _count("SELECT COUNT(*) FROM affordable_page_info WHERE has_waitlist_mention=1")
    conn.close()

    console.print(f"[bold]Properties:[/] {props}")
    console.print(f"  Websites OK: {ok}  |  Unreachable: {unreachable}")
    console.print(f"[bold]Unit listings scraped:[/] {units}  (with rent data: {with_rent})")
    console.print(f"[bold]Live listings (current snapshot):[/] {live}  (with rent: {live_rent})")
    console.print(
        f"  Availability — now: {av_now}  |  future-dated: {av_future}  |  "
        f"waitlist: {av_wait}  |  with a calendar date: {av_date}"
    )
    console.print(
        f"[bold]MFTE/IZ/MHA buildings:[/] {aff_bldgs}  "
        f"(MFTE units: {mfte_units}  |  IZ: {iz_units}  |  "
        f"MHA: {mha_units} in {mha_bldgs} buildings)"
    )
    console.print(f"[bold]Rent limit rows:[/] {rent_limits}")
    console.print(f"[bold]Qualification rows:[/] {quals}")
    console.print(f"[bold]Website info:[/] {pages_ok} sites checked  ({pages_waitlist} mention a waitlist)")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Seattle Affordable Housing Scraper",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("fetch", help="Pull all properties from ArcGIS FeatureServer")
    discover_p = sub.add_parser("discover", help="Validate/discover property websites")
    discover_p.add_argument(
        "--existing-only",
        action="store_true",
        help="Only validate URLs we already have; skip the slow search for missing ones",
    )

    scrape_p = sub.add_parser("scrape", help="Scrape property websites for availability")
    scrape_p.add_argument("--limit", type=int, default=None, help="Max properties to scrape")
    scrape_p.add_argument(
        "--source",
        choices=["seattle_oh", "wshfc", "appfolio"],
        default=None,
        help="Restrict to one data source instead of every property",
    )

    sub.add_parser("appfolio", help="Scrape master AppFolio property management pages")
    sub.add_parser(
        "wshfc",
        help="Fetch statewide LIHTC properties (WSHFC + HUD coordinates, all WA counties)",
    )
    sub.add_parser(
        "affordable",
        aliases=["mfte", "mha"],
        help="Fetch MFTE/IZ/MHA buildings (unit counts + AMI levels)",
    )
    sub.add_parser("rentlimits", help="Fetch official MFTE/MHA income & rent limit schedules")
    sub.add_parser("qualify", help="Recompute per-building qualification info (rents + income limits)")
    sub.add_parser("lihi", help="Fetch LIHI waitlist status (open/closed + dates)")

    pages_p = sub.add_parser("pages", help="Scrape property websites for posted MFTE/MHA info & waitlists")
    pages_p.add_argument("--limit", type=int, default=None, help="Max buildings to check")

    all_p = sub.add_parser("all", help="Run fetch + discover + scrape")
    all_p.add_argument("--limit", type=int, default=None, help="Limit for scrape step")

    sub.add_parser("export", help="Export results to CSV/JSON")
    sub.add_parser("stats", help="Show database statistics")

    args = parser.parse_args()

    commands = {
        "fetch": cmd_fetch,
        "discover": cmd_discover,
        "appfolio": cmd_appfolio,
        "wshfc": cmd_wshfc,
        "affordable": cmd_affordable,
        "mfte": cmd_affordable,
        "mha": cmd_affordable,
        "rentlimits": cmd_rentlimits,
        "qualify": cmd_qualify,
        "lihi": cmd_lihi,
        "pages": cmd_pages,
        "scrape": cmd_scrape,
        "all": cmd_all,
        "export": cmd_export,
        "stats": cmd_stats,
    }

    if not hasattr(args, "limit"):
        args.limit = None

    commands[args.command](args)


if __name__ == "__main__":
    main()
