"""
Scrape each property's website for availability, pricing, and descriptions.

Strategy:
1. Try httpx first (fast, handles most static/SSR sites)
2. Fall back to Playwright for JS-heavy sites (uses domcontentloaded for speed)
3. Detect property management platform embeds (AppFolio, Entrata, Yardi, RealPage)
   and query them directly — this gets the richest data
4. Parse HTML for unit type / rent / sqft / availability date
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

import availability
import db
from config import HEADERS, REQUEST_TIMEOUT, SCRAPE_CONCURRENCY, REQUEST_DELAY, USER_AGENT
from models import UnitListing

console = Console()

AVAIL_KEYWORDS = re.compile(
    r"availab|floor.?plan|pricing|rent|apply|units|leasing",
    re.IGNORECASE,
)

# Require at least one leading digit to avoid matching bare `$,` in binary content
RENT_RE = re.compile(r"\$\s*(\d[\d,]*)\s*(?:/\s*mo(?:nth)?)?", re.IGNORECASE)

UNIT_TYPE_MAP = [
    (re.compile(r"micro|efficiency", re.I), "micro"),
    (re.compile(r"studio|stu\b", re.I), "studio"),
    (re.compile(r"\b1[\s-]?b(?:ed(?:room)?)?|\bone[\s-]?bed|\b1\s*bd\b", re.I), "1br"),
    (re.compile(r"\b2[\s-]?b(?:ed(?:room)?)?|\btwo[\s-]?bed|\b2\s*bd\b", re.I), "2br"),
    (re.compile(r"\b3[\s-]?b(?:ed(?:room)?)?|\bthree[\s-]?bed|\b3\s*bd\b", re.I), "3br"),
]

# iframe src patterns for property management platforms
PM_IFRAME_PATTERNS = {
    "appfolio": re.compile(r"appfolio\.com/listings", re.I),
    "entrata": re.compile(r"entrata\.com", re.I),
    "yardi": re.compile(r"yardirentcafe\.com", re.I),
    "realpage": re.compile(r"realpage\.com|resman\.com", re.I),
    "knock": re.compile(r"knockcrm\.com", re.I),
}

# Nav/menu text patterns to skip when extracting descriptions
NAV_TEXT_RE = re.compile(
    r"^(skip to|menu|navigation|search|log ?in|sign ?in|contact us|about us|"
    r"get started|learn more|click here|read more|view all|see all|home|donate|"
    r"give|careers?|jobs?|resident portal|open menu|close menu)$",
    re.I,
)


def _normalize_unit_type(text: str) -> str | None:
    for pattern, label in UNIT_TYPE_MAP:
        if pattern.search(text):
            return label
    return None


def _extract_rents(text: str) -> tuple[int | None, int | None]:
    # Strip deposit/fee amounts before scanning so they don't pollute rent_min
    cleaned = re.sub(r'\$\s*[\d,]+\s*(?:[a-zA-Z-]+\s+){0,3}(?:deposit|fee|bonus|holding|refundable)\b', '', text, flags=re.I)
    cleaned = re.sub(r'\b(?:deposit|fee)s?\b(?:[^\$]{0,30})\$\s*[\d,]+', '', cleaned, flags=re.I)
    matches = [int(m.replace(",", "")) for m in RENT_RE.findall(cleaned)]
    matches = [m for m in matches if 400 < m < 20000]
    if not matches:
        return None, None
    return min(matches), max(matches)


def _extract_sqft(text: str) -> int | None:
    m = re.search(r"(\d{3,4})\s*(?:sq\.?\s*ft|square\s+feet)", text, re.I)
    if m:
        val = int(m.group(1))
        return val if 100 < val < 5000 else None
    return None


def _extract_description(soup: BeautifulSoup) -> str | None:
    """Return the first substantive paragraph, skipping navigation/menu text."""
    for tag in soup.find_all(["p", "div"], limit=80):
        # Skip tags inside nav/header/footer
        if tag.find_parent(["nav", "header", "footer"]):
            continue
        text = tag.get_text(" ", strip=True)
        # Must be meaningful prose (>80 chars, not a nav item)
        if len(text) < 80:
            continue
        lines = [l.strip() for l in text.split("\n") if l.strip()]
        # Skip if it's mostly short nav-like lines
        if lines and all(len(l) < 40 for l in lines[:5]):
            continue
        if NAV_TEXT_RE.match(text[:60]):
            continue
        return text[:500]
    return None


AVAIL_PRIORITY = re.compile(r"availab", re.I)
AVAIL_SECONDARY = re.compile(r"floor.?plan|pricing|rent|apply|units|leasing", re.I)
NON_HTML_EXT = re.compile(r"\.(pdf|docx?|xlsx?|csv|zip|png|jpe?g|gif|svg|mp4|mp3)(\?|$)", re.I)


def _find_availability_url(soup: BeautifulSoup, base_url: str) -> str | None:
    high: list[str] = []
    low: list[str] = []
    base_netloc = urlparse(base_url).netloc

    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if not href or href.startswith(("#", "mailto:", "tel:", "javascript:")):
            continue
        if NON_HTML_EXT.search(href):
            continue
        text = a.get_text(" ", strip=True)
        full_url = urljoin(base_url, href)
        if NON_HTML_EXT.search(full_url):
            continue
        same_domain = urlparse(full_url).netloc == base_netloc

        if AVAIL_PRIORITY.search(href) or AVAIL_PRIORITY.search(text):
            (high if same_domain else low).insert(0, full_url)
        elif AVAIL_SECONDARY.search(href) or AVAIL_SECONDARY.search(text):
            (low if not same_domain else low).append(full_url)

    return (high or low or [None])[0]


def _find_pm_iframe(html: str) -> str | None:
    """Return the src URL if a known property management embed is found.

    Handles both <iframe src="..."> embeds and AppFolio JS widget configs.
    """
    # 1. Standard iframe src
    iframe_re = re.compile(r'<iframe[^>]+src=["\']([^"\']+)["\']', re.I)
    for src in iframe_re.findall(html):
        for _name, pattern in PM_IFRAME_PATTERNS.items():
            if pattern.search(src):
                return src.replace("&amp;", "&")

    # 2. AppFolio JS widget: Appfolio.Listing({ hostUrl: '...', propertyGroup: '...' })
    af_call = re.search(
        r"Appfolio\.Listing\(\s*\{([^}]+)\}", html, re.I | re.S
    )
    if af_call:
        config_str = af_call.group(1)
        host_m = re.search(r"hostUrl\s*:\s*['\"]([^'\"]+)['\"]", config_str, re.I)
        group_m = re.search(r"propertyGroup\s*:\s*['\"]([^'\"]+)['\"]", config_str, re.I)
        order_m = re.search(r"defaultOrder\s*:\s*['\"]([^'\"]+)['\"]", config_str, re.I)
        if host_m and group_m:
            host = host_m.group(1).rstrip("/")
            group = group_m.group(1)
            order = order_m.group(1) if order_m else "date_posted"
            if not host.startswith("http"):
                host = "https://" + host
            from urllib.parse import quote
            return (
                f"{host}/listings?"
                f"filters%5Bproperty_list%5D={quote(group)}"
                f"&filters%5Border_by%5D={quote(order)}"
            )

    return None


def _parse_appfolio_html(html: str, property_id: int, source_url: str) -> list[UnitListing]:
    soup = BeautifulSoup(html, "lxml")
    now = datetime.now(timezone.utc).isoformat()
    listings: list[UnitListing] = []

    # AppFolio listing cards have a specific structure
    # Look for listing blocks containing rent + bed/bath + sqft
    listing_blocks = soup.find_all(class_=re.compile(r"listing", re.I)) or \
                     soup.find_all("article") or \
                     soup.find_all(class_=re.compile(r"unit|floor.?plan|property", re.I))

    if not listing_blocks:
        # Fallback: parse the full text for rent/bed patterns
        text = soup.get_text(" ", strip=True)
        return _parse_text_for_units(text, property_id, source_url, now)

    seen: set[tuple] = set()
    for block in listing_blocks:
        text = block.get_text(" ", strip=True)
        if len(text) < 10:
            continue
        unit_type = _normalize_unit_type(text)
        rent_min, rent_max = _extract_rents(text)
        sqft = _extract_sqft(text)
        available_from = availability.extract_from_node(block) or availability.extract_raw(text)

        key = (unit_type, rent_min, rent_max)
        if key in seen:
            continue
        seen.add(key)

        listings.append(UnitListing(
            property_id=property_id,
            unit_type=unit_type or "unknown",
            sqft=sqft,
            rent_min=rent_min,
            rent_max=rent_max,
            available_count=None,
            available_from=available_from,
            property_description=None,
            amenities=None,
            source_url=source_url,
            scraped_at=now,
        ))

    return listings


def _parse_text_for_units(
    text: str, property_id: int, source_url: str, now: str
) -> list[UnitListing]:
    """Parse plain text for unit blocks separated by known patterns."""
    # Split by dollar amounts which typically start a unit listing
    segments = re.split(r"(?=\$\s*[\d,]{3,})", text)
    listings: list[UnitListing] = []
    seen: set[tuple] = set()

    for seg in segments:
        if len(seg) < 10:
            continue
        unit_type = _normalize_unit_type(seg)
        rent_min, rent_max = _extract_rents(seg)
        sqft = _extract_sqft(seg)

        if not rent_min and not unit_type:
            continue

        available_from = availability.extract_raw(seg)

        key = (unit_type, rent_min, rent_max)
        if key in seen:
            continue
        seen.add(key)

        listings.append(UnitListing(
            property_id=property_id,
            unit_type=unit_type or "unknown",
            sqft=sqft,
            rent_min=rent_min,
            rent_max=rent_max,
            available_count=None,
            available_from=available_from,
            property_description=None,
            amenities=None,
            source_url=source_url,
            scraped_at=now,
        ))

    return listings


def _parse_units_from_html(
    html: str, property_id: int, source_url: str
) -> list[UnitListing]:
    soup = BeautifulSoup(html, "lxml")
    now = datetime.now(timezone.utc).isoformat()

    description = _extract_description(soup)

    amenities_list: list[str] = []
    for ul in soup.find_all(["ul", "ol"], limit=20):
        if ul.find_parent(["nav", "header", "footer"]):
            continue
        items = [li.get_text(" ", strip=True) for li in ul.find_all("li")]
        items = [i for i in items if 5 < len(i) < 100 and not NAV_TEXT_RE.match(i)]
        if len(items) >= 3:
            amenities_list.extend(items[:12])
            break
    amenities = "; ".join(amenities_list[:15]) if amenities_list else None

    # Look for unit sections
    unit_sections = soup.find_all(
        class_=re.compile(
            r"floor.?plan|unit.?type|bedroom|availability|listing|rent|price",
            re.I,
        ),
        limit=50,
    )

    if not unit_sections:
        unit_sections = soup.find_all(["tr", "article", "li"], limit=50)

    listings: list[UnitListing] = []
    seen: set[tuple] = set()

    for section in unit_sections:
        if section.find_parent(["nav", "header", "footer"]):
            continue
        text = section.get_text(" ", strip=True)
        if len(text) < 5:
            continue

        unit_type = _normalize_unit_type(text)
        rent_min, rent_max = _extract_rents(text)
        sqft = _extract_sqft(text)

        if not unit_type and not rent_min:
            continue

        avail_m = re.search(r"(\d+)\s+avail", text, re.I)
        available_count = int(avail_m.group(1)) if avail_m else None
        available_from = availability.extract_from_node(section) or availability.extract_raw(text)

        key = (unit_type, rent_min, rent_max)
        if key in seen:
            continue
        seen.add(key)

        listings.append(UnitListing(
            property_id=property_id,
            unit_type=unit_type or "unknown",
            sqft=sqft,
            rent_min=rent_min,
            rent_max=rent_max,
            available_count=available_count,
            available_from=available_from,
            property_description=description,
            amenities=amenities,
            source_url=source_url,
            scraped_at=now,
        ))

    if not listings:
        # Last resort: parse full page text for any rent amounts
        full_text = soup.get_text(" ", strip=True)
        rent_min, rent_max = _extract_rents(full_text)
        listings.append(UnitListing(
            property_id=property_id,
            unit_type="unknown",
            sqft=None,
            rent_min=rent_min,
            rent_max=rent_max,
            available_count=None,
            available_from=None,
            property_description=description,
            amenities=amenities,
            source_url=source_url,
            scraped_at=now,
        ))

    return listings


async def _fetch_html_httpx(
    client: httpx.AsyncClient, url: str
) -> tuple[str | None, str]:
    try:
        resp = await client.get(url, follow_redirects=True, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        return resp.text, str(resp.url)
    except Exception:
        return None, url


async def _fetch_html_playwright(url: str) -> tuple[str | None, str]:
    try:
        from playwright.async_api import async_playwright

        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page(extra_http_headers=HEADERS)
            try:
                # Use domcontentloaded (faster) with a generous timeout
                await page.goto(url, wait_until="domcontentloaded", timeout=45000)
                # Give JS a moment to render
                await page.wait_for_timeout(2000)
            except Exception:
                pass  # Use whatever we got
            html = await page.content()
            final_url = page.url
            await browser.close()
            return html, final_url
    except Exception as e:
        console.print(f"[yellow]Playwright failed for {url}: {e}[/]")
        return None, url


def _is_js_shell(html: str) -> bool:
    soup = BeautifulSoup(html, "lxml")
    text = soup.get_text(" ", strip=True)
    return len(text) < 300


# Anti-bot interstitials render as a normal page but contain no listing data.
# Parsing them yields junk rows, so detect and discard instead.
BOT_WALL_RE = re.compile(
    r"performing security verification|checking your browser|"
    r"verify (?:you are|you're) (?:a )?human|enable javascript and cookies to continue|"
    r"just a moment\s*\.{3}|attention required!\s*\|\s*cloudflare|access denied",
    re.IGNORECASE,
)


def _is_bot_wall(html: str) -> bool:
    if not html:
        return False
    text = BeautifulSoup(html, "lxml").get_text(" ", strip=True)
    return bool(BOT_WALL_RE.search(text[:4000]))


ROBOTS_CACHE = {}

async def _can_fetch(client: httpx.AsyncClient, url: str) -> bool:
    parsed = urlparse(url)
    domain = parsed.netloc
    if domain in ROBOTS_CACHE:
        return ROBOTS_CACHE[domain].can_fetch(USER_AGENT, url)
        
    robots_url = f"{parsed.scheme}://{domain}/robots.txt"
    rp = RobotFileParser(url=robots_url)
    try:
        resp = await client.get(robots_url, follow_redirects=True, timeout=10)
        if resp.status_code < 400:
            rp.parse(resp.text.splitlines())
    except Exception:
        pass
    
    ROBOTS_CACHE[domain] = rp
    return rp.can_fetch(USER_AGENT, url)


async def _scrape_property(
    client: httpx.AsyncClient,
    semaphore: asyncio.Semaphore,
    property_id: int,
    url: str,
) -> list[UnitListing]:
    async with semaphore:
        await asyncio.sleep(REQUEST_DELAY)
        
        if not await _can_fetch(client, url):
            console.print(f"[yellow]Skipping {url} due to robots.txt rules[/]")
            return []

        # Step 1: fetch the property home page
        html, final_url = await _fetch_html_httpx(client, url)

        if html is None or _is_js_shell(html):
            html, final_url = await _fetch_html_playwright(url)

        if html is None:
            return []

        if _is_bot_wall(html):
            # The site is gating automated access; respect that rather than
            # storing parsed fragments of the interstitial.
            console.print(f"[yellow]Bot-protection interstitial at {final_url} — skipping[/]")
            return []

        # Step 2: check for PM platform iframes — highest quality data
        pm_iframe_url = _find_pm_iframe(html)
        if pm_iframe_url:
            iframe_html, iframe_url = await _fetch_html_httpx(client, pm_iframe_url)
            if iframe_html and not _is_js_shell(iframe_html):
                listings = _parse_appfolio_html(iframe_html, property_id, iframe_url)
                if listings and any(l.rent_min for l in listings):
                    return listings
            # If iframe is also JS-rendered, use Playwright on it
            iframe_html, iframe_url = await _fetch_html_playwright(pm_iframe_url)
            if iframe_html:
                listings = _parse_appfolio_html(iframe_html, property_id, iframe_url)
                if listings and any(l.rent_min for l in listings):
                    return listings

        # Step 3: look for an availability sub-page
        soup = BeautifulSoup(html, "lxml")
        avail_url = _find_availability_url(soup, final_url)

        if avail_url and avail_url.rstrip("/") != final_url.rstrip("/"):
            sub_html, sub_url = await _fetch_html_httpx(client, avail_url)

            if sub_html is None or _is_js_shell(sub_html):
                sub_html, sub_url = await _fetch_html_playwright(avail_url)

            if sub_html:
                # Check for PM iframe on availability page too
                pm_iframe_url = _find_pm_iframe(sub_html)
                if pm_iframe_url:
                    iframe_html, iframe_url = await _fetch_html_httpx(client, pm_iframe_url)
                    if not iframe_html or _is_js_shell(iframe_html):
                        iframe_html, iframe_url = await _fetch_html_playwright(pm_iframe_url)
                    if iframe_html:
                        listings = _parse_appfolio_html(iframe_html, property_id, iframe_url)
                        if listings and any(l.rent_min for l in listings):
                            return listings

                html = sub_html
                final_url = sub_url

        # Step 4: parse HTML directly
        return _parse_units_from_html(html, property_id, final_url)


async def _run_async(rows: list, limit: int | None) -> None:
    if limit:
        rows = rows[:limit]

    semaphore = asyncio.Semaphore(SCRAPE_CONCURRENCY)
    async with httpx.AsyncClient(
        headers=HEADERS, follow_redirects=True, timeout=REQUEST_TIMEOUT
    ) as client:
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            transient=True,
        ) as progress:
            task = progress.add_task("Scraping property websites...", total=len(rows))

            async def scrape_and_save(row: dict) -> None:
                url = row.get("website_discovered") or row.get("website") or ""
                if not url:
                    progress.advance(task)
                    return

                try:
                    listings = await _scrape_property(client, semaphore, row["id"], url)
                    if listings:
                        for l in listings:
                            availability.annotate(l)
                        with db.db_conn() as conn:
                            db.insert_units_snapshot(conn, row["id"], listings, source="site")
                except Exception as e:
                    console.print(f"[red]Error scraping {url}: {e}[/]")
                finally:
                    progress.advance(task)

            await asyncio.gather(*[scrape_and_save(dict(r)) for r in rows])

    console.print(f"[bold green]Scraping complete for {len(rows)} properties.[/]")


def run(limit: int | None = None, source: str | None = None) -> None:
    """Scrape property websites for availability.

    `source` restricts the run to one data_source (seattle_oh / wshfc /
    appfolio). With thousands of properties now spanning several ingests,
    re-scraping everything to reach a newly added subset is wasteful.
    """
    params: list = []
    source_clause = ""
    if source:
        source_clause = "AND IFNULL(data_source, 'seattle_oh') = ?"
        params.append(source)
    with db.db_conn() as conn:
        rows = conn.execute(
            f"""
            SELECT id, building_name, website, website_discovered, website_status
            FROM properties
            WHERE (
                    website_status = 'ok'
                 OR (website_status IS NULL AND (website IS NOT NULL AND website != ''))
                  )
              {source_clause}
            ORDER BY id
            """,
            params,
        ).fetchall()

    if not rows:
        console.print(
            "[yellow]No properties with valid websites. Run 'fetch' and 'discover' first.[/]"
        )
        return

    count = len(rows) if not limit else min(limit, len(rows))
    console.print(f"[cyan]Scraping {count} property websites...[/]")
    asyncio.run(_run_async(rows, limit))
