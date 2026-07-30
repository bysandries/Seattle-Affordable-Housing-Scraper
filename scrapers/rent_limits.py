"""Download and parse Seattle Office of Housing income & rent limit schedules.

Three PDFs are published annually (effective mid-May):
  - MILU:    applies to MHA, Incentive Zoning, MFTE P3-P5, and other
             market-incentive/land-use units
  - MFTE_P6: MFTE Program 6 units
  - MFTE_P7: MFTE Program 7 units

Each PDF holds an income-limits table (family size x %AMI, annual income) and
a maximum-rent table (unit size x %AMI, monthly rent incl. fees/utilities).
Table rows are plain text lines; the active column header is the most recent
line containing several NN% tokens.
"""

import io
import re
from datetime import datetime, timezone

import httpx
import pdfplumber
from rich.console import Console

import db
from config import HEADERS, RENT_LIMIT_PDFS, REQUEST_TIMEOUT
from models import IncomeLimit, RentLimit

console = Console()

PCT_RE = re.compile(r"(\d+)%")
MONEY_RE = re.compile(r"\$([\d,]+)")
RENT_ROW_RE = re.compile(r"^(\d-Bedroom)\s+\$")
INCOME_ROW_RE = re.compile(r"^([1-6])\s+\$")
EFFECTIVE_RE = re.compile(r"Effective Date:\s*(.+)")


def _parse_pdf(content: bytes, program: str, url: str, fetched_at: str):
    rents: list[RentLimit] = []
    incomes: list[IncomeLimit] = []
    effective_date = ""
    current_pcts: list[int] = []

    with pdfplumber.open(io.BytesIO(content)) as pdf:
        lines = []
        for page in pdf.pages:
            lines.extend((page.extract_text() or "").splitlines())

    for line in lines:
        line = line.strip()

        if not effective_date:
            m = EFFECTIVE_RE.search(line)
            if m:
                effective_date = m.group(1).strip()

        # A line with several NN% tokens is a column header (prose mentioning
        # AMI levels also matches, but a real header always follows it before
        # any data row appears).
        pcts = [int(p) for p in PCT_RE.findall(line)]
        if len(pcts) >= 3:
            current_pcts = pcts

        money = [int(v.replace(",", "")) for v in MONEY_RE.findall(line)]
        if not money or not current_pcts:
            continue

        rent_m = RENT_ROW_RE.match(line)
        income_m = INCOME_ROW_RE.match(line)
        if not rent_m and not income_m:
            continue
        if len(money) != len(current_pcts):
            console.print(
                f"[yellow]Skipping row with {len(money)} values vs "
                f"{len(current_pcts)} columns in {program}: {line[:60]}[/]"
            )
            continue

        if rent_m:
            rents.extend(
                RentLimit(program, rent_m.group(1), pct, val, effective_date, url, fetched_at)
                for pct, val in zip(current_pcts, money)
            )
        else:
            incomes.extend(
                IncomeLimit(program, int(income_m.group(1)), pct, val, effective_date, url, fetched_at)
                for pct, val in zip(current_pcts, money)
            )

    return rents, incomes, effective_date


def run() -> None:
    db.init_db()
    fetched_at = datetime.now(timezone.utc).isoformat()

    all_rents: list[RentLimit] = []
    all_incomes: list[IncomeLimit] = []

    with httpx.Client(timeout=REQUEST_TIMEOUT, headers=HEADERS, follow_redirects=True) as client:
        for program, url in RENT_LIMIT_PDFS.items():
            console.print(f"[bold cyan]Fetching {program} limits...[/]")
            resp = client.get(url)
            resp.raise_for_status()

            rents, incomes, effective = _parse_pdf(resp.content, program, url, fetched_at)
            if not rents or not incomes:
                raise RuntimeError(f"Parsed no data from {program} PDF ({url})")

            console.print(
                f"  [green]{program}[/]: {len(rents)} rent limits, "
                f"{len(incomes)} income limits (effective {effective})"
            )
            all_rents.extend(rents)
            all_incomes.extend(incomes)

    with db.db_conn() as conn:
        db.upsert_rent_limits(conn, all_rents)
        db.upsert_income_limits(conn, all_incomes)

    console.print(
        f"[bold green]Done.[/] {len(all_rents)} rent limits and "
        f"{len(all_incomes)} income limits saved."
    )
