"""
Seattle Affordable Housing Scraper — CLI entry point.

Usage:
    python main.py fetch              Pull all 742 properties from ArcGIS
    python main.py discover           Validate/discover property websites
    python main.py scrape             Scrape all property sites for availability
    python main.py scrape --limit 10  Scrape only 10 properties (for testing)
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


def cmd_discover(_args: argparse.Namespace) -> None:
    from scrapers.website_discovery import run
    run()


def cmd_scrape(args: argparse.Namespace) -> None:
    from scrapers.property_scraper import run
    run(limit=args.limit)

def cmd_appfolio(_args: argparse.Namespace) -> None:
    from scrapers.appfolio_master import run
    run()


def cmd_all(args: argparse.Namespace) -> None:
    cmd_fetch(args)
    cmd_discover(args)
    cmd_appfolio(args)
    cmd_scrape(args)


def cmd_export(_args: argparse.Namespace) -> None:
    import sqlite3
    import pandas as pd
    from config import DB_PATH, OUTPUT_DIR

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    props = pd.read_sql_query("SELECT * FROM properties", conn)
    units = pd.read_sql_query("SELECT * FROM units", conn)
    conn.close()

    # Merged view: one row per unit listing enriched with property info
    merged = units.merge(
        props[["id", "building_name", "address", "neighborhood", "amis", "br_types",
               "income_restricted_units", "website", "phone", "expiration_date"]],
        left_on="property_id",
        right_on="id",
        how="left",
    ).drop(columns=["id_y"]).rename(columns={"id_x": "unit_id"})

    csv_path = os.path.join(OUTPUT_DIR, "results.csv")
    json_path = os.path.join(OUTPUT_DIR, "results.json")
    props_csv = os.path.join(OUTPUT_DIR, "properties.csv")

    merged.to_csv(csv_path, index=False)
    merged.to_json(json_path, orient="records", indent=2)
    props.to_csv(props_csv, index=False)

    console.print(f"[bold green]Exported:[/]")
    console.print(f"  {csv_path}  ({len(merged)} unit rows)")
    console.print(f"  {json_path}")
    console.print(f"  {props_csv}  ({len(props)} properties)")


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
    conn.close()

    console.print(f"[bold]Properties:[/] {props}")
    console.print(f"  Websites OK: {ok}  |  Unreachable: {unreachable}")
    console.print(f"[bold]Unit listings scraped:[/] {units}  (with rent data: {with_rent})")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Seattle Affordable Housing Scraper",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("fetch", help="Pull all properties from ArcGIS FeatureServer")
    sub.add_parser("discover", help="Validate/discover property websites")

    scrape_p = sub.add_parser("scrape", help="Scrape property websites for availability")
    scrape_p.add_argument("--limit", type=int, default=None, help="Max properties to scrape")

    sub.add_parser("appfolio", help="Scrape master AppFolio property management pages")

    all_p = sub.add_parser("all", help="Run fetch + discover + scrape")
    all_p.add_argument("--limit", type=int, default=None, help="Limit for scrape step")

    sub.add_parser("export", help="Export results to CSV/JSON")
    sub.add_parser("stats", help="Show database statistics")

    args = parser.parse_args()

    commands = {
        "fetch": cmd_fetch,
        "discover": cmd_discover,
        "appfolio": cmd_appfolio,
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
