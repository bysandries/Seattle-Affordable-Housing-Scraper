"""Normalize scraped availability text into a comparable date + status.

Property sites express availability a dozen different ways ("Now", "Avail.
9/1", "Available September 1st", "Move-in ready", "Call for availability").
This turns any of them into:

    (iso_date | None, status)

where status is one of:
    now      — available immediately (or a date that has already passed)
    future   — available on a specific upcoming date
    waitlist — explicitly waitlisted / not accepting applications
    unknown  — nothing parseable was published

Year inference: sites usually omit the year ("9/1"). A bare month/day is
resolved to the next occurrence on or after the scrape date, so a listing
scraped in December that says "1/15" resolves to the following January.
"""

import re
from datetime import date, datetime, timedelta

STATUS_NOW = "now"
STATUS_FUTURE = "future"
STATUS_WAITLIST = "waitlist"
STATUS_UNKNOWN = "unknown"

MONTHS = {
    "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3,
    "apr": 4, "april": 4, "may": 5, "jun": 6, "june": 6, "jul": 7, "july": 7,
    "aug": 8, "august": 8, "sep": 9, "sept": 9, "september": 9,
    "oct": 10, "october": 10, "nov": 11, "november": 11, "dec": 12, "december": 12,
}

NOW_RE = re.compile(
    r"\b(available\s+now|avail(?:able)?\s*[:\-]?\s*now|now|immediate(?:ly)?|"
    r"today|move[\s-]?in\s+ready|ready\s+now|current(?:ly)?\s+available)\b",
    re.IGNORECASE,
)
WAITLIST_RE = re.compile(
    r"wait[\s-]?list|waiting\s+list|not\s+accepting|closed|full|"
    r"no\s+(?:current\s+)?availability|unavailable",
    re.IGNORECASE,
)
# 9/1/26, 09/01/2026, 9-1-26 — a year is present, so the separator may be either.
NUMERIC_YEAR_RE = re.compile(r"\b(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})\b")
# 9/1 with no year. Slash only: a bare "1-2" is far more likely a range
# ("1-2 Bedrooms") than a date, and reading it as Jan 2 corrupts real listings.
NUMERIC_NOYEAR_RE = re.compile(r"\b(\d{1,2})/(\d{1,2})\b")
# 2026-09-01
ISO_RE = re.compile(r"\b(\d{4})-(\d{1,2})-(\d{1,2})\b")
# September 1, 2026 / Sept 1st / Sep 1
MONTH_NAME_RE = re.compile(
    r"\b(" + "|".join(sorted(MONTHS, key=len, reverse=True)) + r")\.?\s+"
    r"(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?\b",
    re.IGNORECASE,
)
# 1 September 2026
DAY_MONTH_RE = re.compile(
    r"\b(\d{1,2})(?:st|nd|rd|th)?\s+(" + "|".join(sorted(MONTHS, key=len, reverse=True)) + r")\.?"
    r"(?:\s*,?\s*(\d{4}))?\b",
    re.IGNORECASE,
)

# Month with no day: "Jan 2026", "August 2026". Any month name is accepted when
# an explicit year follows.
MONTH_YEAR_RE = re.compile(
    r"\b(" + "|".join(sorted(MONTHS, key=len, reverse=True)) + r")\.?\s*,?\s*(\d{4})\b",
    re.IGNORECASE,
)
# Bare month with no day and no year ("available September"). "May", "March" and
# "August" are excluded here because they are ordinary English words and would
# produce false dates from marketing prose.
_UNAMBIGUOUS = [m for m in MONTHS if m not in ("may", "march", "august", "mar", "aug")]
MONTH_ONLY_RE = re.compile(
    r"\b(" + "|".join(sorted(_UNAMBIGUOUS, key=len, reverse=True)) + r")\.?\b",
    re.IGNORECASE,
)

# Text that mentions availability but carries no date meaning. Checked before
# date parsing so "available 24/7" or "2 available" never yields a date.
ANTI_RE = re.compile(
    r"""(?ix)
      \b24\s*/\s*7\b
    | available\s+(?:amenities|parking|upon\s+request|by\s+appointment|units?\s+vary)
    | parking\s+available
    | \d+\s+available\s+units?
    | units?\s+available\b(?!\s*[:\-]?\s*\d)
    | \d+\s*(?:-|–|to)\s*\d+\s*(?:bd|ba|bed|bath|bedroom|bathroom)s?   # "1-2 Bedrooms"
    | \b\d{1,2}\s*(?:bd|ba|bed|bath)\b
    | \b[\d,]+\s*sq\.?\s*ft\.?
    | \$\s*[\d,]+(?:\.\d{2})?
    | \b\d{1,2}:\d{2}\s*(?:am|pm)?\b                                   # office hours
    | \b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b                                  # phone
    | \bWA\s+9\d{4}\b                                                  # zip in address
    """,
)


def _resolve_year(month: int, day: int, ref: date, year: int | None) -> date | None:
    if year is not None:
        if year < 100:
            year += 2000
        try:
            return date(year, month, day)
        except ValueError:
            return None
    # No year given: pick the next occurrence on or after the reference date,
    # tolerating listings posted slightly after the date passed.
    for candidate_year in (ref.year, ref.year + 1):
        try:
            d = date(candidate_year, month, day)
        except ValueError:
            continue
        if d >= ref - timedelta(days=60):
            return d
    return None


def _parse_ref(scraped_at: str | None) -> date:
    if not scraped_at:
        return datetime.now().date()
    try:
        return datetime.fromisoformat(scraped_at.replace("Z", "+00:00")).date()
    except ValueError:
        return datetime.now().date()


def parse_date(text: str, ref: date) -> date | None:
    """Extract the first plausible calendar date from `text`."""
    m = ISO_RE.search(text)
    if m:
        try:
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            return None

    m = NUMERIC_YEAR_RE.search(text) or NUMERIC_NOYEAR_RE.search(text)
    if m:
        month, day = int(m.group(1)), int(m.group(2))
        year = int(m.group(3)) if m.lastindex and m.lastindex >= 3 else None
        if 1 <= month <= 12 and 1 <= day <= 31:
            return _resolve_year(month, day, ref, year)

    m = MONTH_NAME_RE.search(text)
    if m:
        month = MONTHS[m.group(1).lower()]
        day = int(m.group(2))
        year = int(m.group(3)) if m.group(3) else None
        return _resolve_year(month, day, ref, year)

    m = DAY_MONTH_RE.search(text)
    if m:
        day = int(m.group(1))
        month = MONTHS[m.group(2).lower()]
        year = int(m.group(3)) if m.group(3) else None
        return _resolve_year(month, day, ref, year)

    # Month with no day ("Jan 2026", "available September") — treat as the 1st.
    m = MONTH_YEAR_RE.search(text)
    if m:
        return _resolve_year(MONTHS[m.group(1).lower()], 1, ref, int(m.group(2)))

    m = MONTH_ONLY_RE.search(text)
    if m:
        return _resolve_year(MONTHS[m.group(1).lower()], 1, ref, None)

    return None


def normalize(raw: str | None, scraped_at: str | None = None) -> tuple[str | None, str]:
    """Return (ISO date or None, status) for a raw availability string."""
    if not raw or not raw.strip():
        return None, STATUS_UNKNOWN

    text = re.sub(r"\s+", " ", raw.strip())
    ref = _parse_ref(scraped_at)

    # Strip non-date "available" phrases so they can't be mined for numbers.
    cleaned = ANTI_RE.sub(" ", text)

    # Waitlist wins over an availability date, but keep any date attached to it
    # ("Waitlist Opening 3/2/26" says when the list opens — that's the useful bit).
    if WAITLIST_RE.search(text):
        parsed = parse_date(cleaned, ref)
        return (parsed.isoformat() if parsed else None), STATUS_WAITLIST

    parsed = parse_date(cleaned, ref)
    if parsed:
        # A date already in the past means the unit has been ready since then.
        status = STATUS_NOW if parsed <= ref else STATUS_FUTURE
        return parsed.isoformat(), status

    if NOW_RE.search(cleaned):
        return None, STATUS_NOW

    return None, STATUS_UNKNOWN


# Ordered extraction patterns, most specific first. Each captures the phrase
# describing availability; `normalize` then interprets it.
EXTRACT_PATTERNS = [
    # "Date Available: 9/1/26" / "Availability Date - Sept 1"
    re.compile(
        r"(?:date\s+available|availability\s+date|available\s+date)\s*[:\-–]?\s*"
        r"([A-Za-z]{3,9}\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{2,4})?|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/\-]\d{1,2}(?:[/\-]\d{2,4})?)",
        re.IGNORECASE,
    ),
    # "Available: 9/1/26" / "Avail. 8/15" / "Available on September 1"
    re.compile(
        r"avail(?:able|\.)?\s*(?:from|on|starting|beginning|as\s+of)?\s*[:\-–]?\s*"
        r"([A-Za-z]{3,9}\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{2,4})?|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/\-]\d{1,2}(?:[/\-]\d{2,4})?)",
        re.IGNORECASE,
    ),
    # "Move-in: 08/01/2026"
    re.compile(
        r"move[\s-]?in(?:\s+date)?\s*[:\-–]?\s*"
        r"([A-Za-z]{3,9}\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{2,4})?|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/\-]\d{1,2}(?:[/\-]\d{2,4})?)",
        re.IGNORECASE,
    ),
    # Immediate-availability phrases (no date)
    re.compile(
        r"(available\s+now|avail(?:able)?\s*[:\-–]?\s*now|move[\s-]?in\s+ready|"
        r"ready\s+(?:now|to\s+move)|immediate(?:ly)?\s+available|available\s+immediately)",
        re.IGNORECASE,
    ),
    # Waitlist phrases
    re.compile(r"(wait[\s-]?list(?:\s+(?:open|closed|only))?|waiting\s+list)", re.IGNORECASE),
    # "Vacancy Available!" and notice text like "Effective Date: June 5th 2026"
    re.compile(r"(vacanc(?:y|ies)\s+available)", re.IGNORECASE),
    re.compile(
        r"effective\s+(?:date\s*:?|on)\s*"
        r"([A-Za-z]{3,9}\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{2,4})?|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/\-]\d{1,2}(?:[/\-]\d{2,4})?)",
        re.IGNORECASE,
    ),
]

# A field whose entire content signals immediate availability.
BARE_NOW_RE = re.compile(r"\s*(?:now|available)\s*", re.IGNORECASE)


def extract_raw(text: str | None, field_is_availability: bool = False) -> str | None:
    """Find the availability phrase in a block of listing text.

    Returns the matched phrase (not yet normalized), or None. Anti-patterns are
    removed first so "parking available 24/7" can't masquerade as a date.

    Set `field_is_availability` when the text came from an element already known
    to hold availability — a `.js-listing-available` span, or the value side of
    an "Available:" label. Those carry a bare date with no keyword to anchor on,
    so the keyword requirement is dropped.
    """
    if not text:
        return None
    cleaned = ANTI_RE.sub(" ", re.sub(r"\s+", " ", text))
    for pattern in EXTRACT_PATTERNS:
        m = pattern.search(cleaned)
        if m:
            return (m.group(1) if m.groups() else m.group(0)).strip()

    if field_is_availability:
        stripped = cleaned.strip()
        if BARE_NOW_RE.fullmatch(stripped):
            return stripped
        if parse_date(stripped, datetime.now().date()):
            return stripped
    return None


# Label text marking the field next to it as the availability value.
FIELD_LABEL_RE = re.compile(
    r"^\s*(?:date\s+)?avail(?:able|ability)?\b|^\s*move[-\s]?in(?:\s+date)?\b", re.IGNORECASE
)
# Element class/id naming it an availability field.
FIELD_ATTR_RE = re.compile(r"avail", re.IGNORECASE)


def extract_from_node(node) -> str | None:
    """Pull availability out of a unit card's DOM before falling back to text.

    Two structured shapes are common and far more reliable than scanning prose:
    a labeled pair (`<dt>Available</dt><dd>9/10/26</dd>`, `<th>/<td>`) and an
    element whose own class or id names it an availability field
    (`.js-listing-available`). Both hold a bare date with no keyword, so they
    are read in field mode.
    """
    if node is None:
        return None

    for label in node.find_all(["dt", "th", "label", "strong", "b", "span"], limit=40):
        if not FIELD_LABEL_RE.search(label.get_text(" ", strip=True)):
            continue
        value = label.find_next_sibling()
        if value is not None:
            found = extract_raw(value.get_text(" ", strip=True), field_is_availability=True)
            if found:
                return found

    for el in node.find_all(attrs={"class": FIELD_ATTR_RE}, limit=20) + node.find_all(
        attrs={"id": FIELD_ATTR_RE}, limit=20
    ):
        found = extract_raw(el.get_text(" ", strip=True), field_is_availability=True)
        if found:
            return found

    return None


def annotate(listing, scraped_at: str | None = None) -> None:
    """Fill a UnitListing's normalized availability fields in place."""
    iso, status = normalize(listing.available_from, scraped_at or listing.scraped_at)
    listing.available_date = iso
    listing.availability_status = status
