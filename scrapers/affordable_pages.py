"""Scrape property websites for publicly posted MFTE/MHA/affordable-unit info.

For each affordable building (MFTE / IZ / MHA), fetch its website's homepage
plus a few likely subpages (affordable housing, floor plans, leasing) and
record which programs the site mentions, whether a waitlist is mentioned,
any AMI percentages posted, and a text snippet around the most relevant
mention. Read-only, robots.txt-aware, throttled — no forms, no contact.
"""

import asyncio
import re
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser

import httpx
from bs4 import BeautifulSoup
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn

import db
from config import HEADERS, REQUEST_DELAY, REQUEST_TIMEOUT, SCRAPE_CONCURRENCY, USER_AGENT
from models import AffordablePageInfo

console = Console()

LINK_KEYWORDS = re.compile(
    r"afford|mfte|mha|income|floor.?plan|pricing|avail|leas|resident|apply",
    re.IGNORECASE,
)
MFTE_RE = re.compile(r"\bmfte\b|multi.?family tax exemption", re.IGNORECASE)
MHA_RE = re.compile(r"\bmha\b|mandatory housing affordability", re.IGNORECASE)
AFFORDABLE_RE = re.compile(r"affordable housing|income.?restricted|income.?qualified", re.IGNORECASE)
WAITLIST_RE = re.compile(r"wait.?list", re.IGNORECASE)
AMI_RE = re.compile(r"(\d{2,3})\s*%\s*(?:of\s+)?(?:the\s+)?(?:area\s+median(?:\s+income)?|ami)", re.IGNORECASE)
SNIPPET_RE = re.compile(
    r"\bmfte\b|\bmha\b|multi.?family tax exemption|mandatory housing affordability|"
    r"affordable housing|income.?restricted|wait.?list",
    re.IGNORECASE,
)

MAX_SUBPAGES = 4


def _clean_url(url: str) -> str | None:
    url = (url or "").strip()
    if not url:
        return None
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    return url


async def _robots_allowed(client: httpx.AsyncClient, url: str) -> bool:
    try:
        root = f"{urlparse(url).scheme}://{urlparse(url).netloc}"
        resp = await client.get(urljoin(root, "/robots.txt"))
        if resp.status_code != 200:
            return True
        rp = RobotFileParser()
        rp.parse(resp.text.splitlines())
        return rp.can_fetch(USER_AGENT, url)
    except Exception:
        return True


def _analyze(text: str) -> dict:
    return {
        "mfte": bool(MFTE_RE.search(text)),
        "mha": bool(MHA_RE.search(text)),
        "affordable": bool(AFFORDABLE_RE.search(text)),
        "waitlist": bool(WAITLIST_RE.search(text)),
        "amis": sorted({int(m) for m in AMI_RE.findall(text) if 20 <= int(m) <= 120}),
    }


def _snippet(text: str) -> str:
    m = SNIPPET_RE.search(text)
    if not m:
        return ""
    start = max(0, m.start() - 200)
    chunk = text[start:m.end() + 300]
    return re.sub(r"\s+", " ", chunk).strip()[:500]


async def _scrape_building(client: httpx.AsyncClient, sem: asyncio.Semaphore, b) -> AffordablePageInfo:
    now = datetime.now(timezone.utc).isoformat()
    website = _clean_url(b["website"]) or _clean_url(b["prop_website"])

    def result(**kw):
        base = dict(
            building_id=b["id"], property_id=b["property_id"],
            building_name=b["building_name"], website=website or "",
            pages_checked=0, mentions_mfte=False, mentions_mha=False,
            mentions_affordable=False, has_waitlist_mention=False,
            ami_mentions="", info_url="", snippet="", status="ok", scraped_at=now,
        )
        base.update(kw)
        return AffordablePageInfo(**base)

    if not website:
        return result(status="no_website")

    async with sem:
        try:
            if not await _robots_allowed(client, website):
                return result(status="robots_disallowed")

            resp = await client.get(website)
            resp.raise_for_status()
            soup = BeautifulSoup(resp.text, "html.parser")
            base_url = str(resp.url)
            host = urlparse(base_url).netloc

            # candidate subpages: same-site links whose href/text look relevant
            candidates, seen = [], {base_url}
            for a in soup.find_all("a", href=True):
                href = urljoin(base_url, a["href"].split("#")[0])
                if href in seen or urlparse(href).netloc != host:
                    continue
                if LINK_KEYWORDS.search(a["href"]) or LINK_KEYWORDS.search(a.get_text(" ", strip=True)):
                    seen.add(href)
                    candidates.append(href)
                if len(candidates) >= MAX_SUBPAGES:
                    break

            pages = [(base_url, soup.get_text(" ", strip=True))]
            for url in candidates:
                await asyncio.sleep(REQUEST_DELAY)
                try:
                    sub = await client.get(url)
                    if sub.status_code == 200 and "html" in sub.headers.get("content-type", ""):
                        pages.append((url, BeautifulSoup(sub.text, "html.parser").get_text(" ", strip=True)))
                except Exception:
                    continue

            merged = result(pages_checked=len(pages))
            best_url, best_snippet, amis = "", "", set()
            for url, text in pages:
                sig = _analyze(text)
                merged.mentions_mfte |= sig["mfte"]
                merged.mentions_mha |= sig["mha"]
                merged.mentions_affordable |= sig["affordable"]
                merged.has_waitlist_mention |= sig["waitlist"]
                amis.update(sig["amis"])
                if not best_snippet and (sig["mfte"] or sig["mha"] or sig["affordable"] or sig["waitlist"]):
                    best_url, best_snippet = url, _snippet(text)
            merged.ami_mentions = ", ".join(str(a) for a in sorted(amis))
            merged.info_url = best_url
            merged.snippet = best_snippet
            return merged
        except Exception as e:
            return result(status=f"error: {type(e).__name__}")
        finally:
            await asyncio.sleep(REQUEST_DELAY)


async def _run_async(limit: int | None) -> list[AffordablePageInfo]:
    with db.db_conn() as conn:
        buildings = conn.execute(
            """
            SELECT ab.*, COALESCE(p.website_discovered, p.website, '') AS prop_website
            FROM affordable_buildings ab
            LEFT JOIN properties p ON p.id = ab.property_id
            ORDER BY ab.id
            """
        ).fetchall()
    if limit:
        buildings = buildings[:limit]

    sem = asyncio.Semaphore(SCRAPE_CONCURRENCY)
    async with httpx.AsyncClient(
        timeout=REQUEST_TIMEOUT, headers=HEADERS, follow_redirects=True
    ) as client:
        with Progress(
            SpinnerColumn(), TextColumn("[progress.description]{task.description}"), console=console
        ) as progress:
            task = progress.add_task(f"Scraping {len(buildings)} building sites...", total=None)
            done = 0

            async def wrapped(b):
                nonlocal done
                r = await _scrape_building(client, sem, b)
                done += 1
                progress.update(task, description=f"Scraped {done}/{len(buildings)} building sites")
                return r

            return await asyncio.gather(*(wrapped(b) for b in buildings))


def run(limit: int | None = None) -> None:
    db.init_db()
    rows = asyncio.run(_run_async(limit))

    with db.db_conn() as conn:
        db.replace_affordable_page_info(conn, rows)

    ok = sum(1 for r in rows if r.status == "ok")
    mha = sum(1 for r in rows if r.mentions_mha)
    mfte = sum(1 for r in rows if r.mentions_mfte)
    waitlist = sum(1 for r in rows if r.has_waitlist_mention)
    console.print(
        f"[bold green]Done.[/] {len(rows)} buildings checked ({ok} ok). "
        f"Mentions — MFTE: {mfte}  |  MHA: {mha}  |  waitlist: {waitlist}"
    )
