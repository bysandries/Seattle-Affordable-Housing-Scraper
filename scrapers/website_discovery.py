"""
Resolve and validate property website URLs.

For properties that already have a Website field: validate it with a HEAD request.
For the ~49 properties with no website: search DuckDuckGo and pick the best match.
"""

import asyncio
from urllib.parse import urlparse

import httpx
try:
    from ddgs import DDGS
except ImportError:
    from duckduckgo_search import DDGS
from rich.console import Console
from rich.progress import track
from tenacity import retry, stop_after_attempt, wait_exponential

import db
from config import HEADERS, REQUEST_TIMEOUT, SKIP_DOMAINS, REQUEST_DELAY

console = Console()


def _domain(url: str) -> str:
    try:
        return urlparse(url).netloc.lower().lstrip("www.")
    except Exception:
        return ""


def _is_aggregator(url: str) -> bool:
    d = _domain(url)
    return any(skip in d for skip in SKIP_DOMAINS)


def _ensure_scheme(url: str) -> str:
    if url and not url.startswith(("http://", "https://")):
        return "https://" + url
    return url


@retry(stop=stop_after_attempt(2), wait=wait_exponential(multiplier=1, min=1, max=4))
async def _validate_url(client: httpx.AsyncClient, url: str) -> str:
    """Return 'ok' or 'unreachable'."""
    try:
        resp = await client.head(url, follow_redirects=True, timeout=REQUEST_TIMEOUT)
        if resp.status_code < 400:
            return "ok"
        # HEAD may be blocked; try GET
        resp = await client.get(url, follow_redirects=True, timeout=REQUEST_TIMEOUT)
        return "ok" if resp.status_code < 400 else "unreachable"
    except Exception:
        return "unreachable"


def _search_website(building_name: str, address: str, city: str = "") -> str | None:
    # The city comes from the property, not a constant: the dataset is statewide
    # now, and searching a Spokane building with "Seattle" finds the wrong thing
    # or nothing at all.
    where = (city or "").strip() or "Washington"
    query = f'"{building_name}" "{address}" {where} WA apartments'
    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=8))
        for r in results:
            url = r.get("href") or r.get("url") or ""
            if url and not _is_aggregator(url):
                return url
        # fallback: return first result even if aggregator
        for r in results:
            url = r.get("href") or r.get("url") or ""
            if url:
                return url
    except Exception as e:
        console.print(f"[yellow]Search failed for '{building_name}': {e}[/]")
    return None


async def _process_row(
    client: httpx.AsyncClient, row: dict, semaphore: asyncio.Semaphore
) -> tuple[int, str | None, str]:
    async with semaphore:
        await asyncio.sleep(REQUEST_DELAY)
        property_id = row["id"]
        website = _ensure_scheme(row["website"] or "")
        discovered = row["website_discovered"]

        if website:
            status = await _validate_url(client, website)
            return property_id, None, status

        # No website — search for it
        found = _search_website(row["building_name"], row["address"], row.get("city") or "")
        if found:
            found = _ensure_scheme(found)
            status = await _validate_url(client, found)
        else:
            status = "unreachable"

        return property_id, found, status


async def _run_async(rows: list) -> None:
    semaphore = asyncio.Semaphore(2)
    async with httpx.AsyncClient(
        headers=HEADERS, follow_redirects=True, timeout=REQUEST_TIMEOUT
    ) as client:
        tasks = [_process_row(client, dict(row), semaphore) for row in rows]
        results = []
        for coro in asyncio.as_completed(tasks):
            result = await coro
            results.append(result)

    with db.db_conn() as conn:
        for property_id, discovered, status in results:
            db.update_website_discovery(conn, property_id, discovered, status)

    ok = sum(1 for _, _, s in results if s == "ok")
    unreachable = sum(1 for _, _, s in results if s == "unreachable")
    console.print(
        f"[bold green]Discovery complete.[/] "
        f"Reachable: {ok}  Unreachable: {unreachable}"
    )


def run(only_with_website: bool = False) -> None:
    """Validate known websites, and search for the ones we lack.

    `only_with_website` skips the search half. Searching is by far the slower
    path — one throttled query per property, against a rate-limited engine — so
    it is worth running the cheap validation on its own when the goal is to get
    known sites scraped.
    """
    clause = (
        "AND website IS NOT NULL AND website != ''" if only_with_website else ""
    )
    with db.db_conn() as conn:
        # Process all properties that haven't been validated yet
        rows = conn.execute(
            "SELECT id, building_name, address, city, website, website_discovered "
            f"FROM properties WHERE website_status IS NULL {clause} ORDER BY id"
        ).fetchall()

    if not rows:
        console.print("[yellow]No properties need website discovery.[/]")
        return

    what = "Validating" if only_with_website else "Validating/discovering"
    console.print(f"[cyan]{what} websites for {len(rows)} properties...[/]")
    asyncio.run(_run_async(rows))
