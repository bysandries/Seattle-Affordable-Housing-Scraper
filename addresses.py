"""Street-address parsing shared by the ingest paths.

Managers and agencies write the same building many ways — "600 Black Lake Blvd
SW 97", "4046 8th Ave NE type", "4020 Bledsoe Ave." — so anything that groups or
joins on an address needs one normalization to agree on.
"""

import re
from html import unescape

# "<street>, <City>, <ST> <zip>" — the unit-number segment between street and
# city is numeric, so requiring letters in the city group skips past it.
CITY_STATE_RE = re.compile(r",\s*([A-Za-z][A-Za-z .'-]+),\s*([A-Z]{2})\b")

# A US street address runs "<number> <name> <type> [<directional>]". Anything
# after that is a unit designator, however the writer chose to mark it — often
# not at all.
STREET_TYPE_CANON = {
    "st": "st", "street": "st",
    "ave": "ave", "av": "ave", "avenue": "ave",
    "rd": "rd", "road": "rd",
    "blvd": "blvd", "boulevard": "blvd",
    "dr": "dr", "drive": "dr",
    "ln": "ln", "lane": "ln",
    "pl": "pl", "place": "pl",
    "ct": "ct", "court": "ct",
    "cir": "cir", "circle": "cir",
    "ter": "ter", "terrace": "ter",
    "pkwy": "pkwy", "parkway": "pkwy",
    "hwy": "hwy", "highway": "hwy",
    "way": "way", "wy": "way",
    "trl": "trl", "trail": "trl",
    "sq": "sq", "square": "sq",
    "loop": "loop",
}

DIRECTIONALS = {
    "n": "n", "s": "s", "e": "e", "w": "w",
    "ne": "ne", "nw": "nw", "se": "se", "sw": "sw",
    "north": "n", "south": "s", "east": "e", "west": "w",
    "northeast": "ne", "northwest": "nw", "southeast": "se", "southwest": "sw",
}

# Street types and directionals carry no identifying information on their own:
# "4301 Stone Way N" and "4301 Alderwood Mall Boulevard" would otherwise look
# similar merely by sharing "way"/"n"-style tokens.
GENERIC_STREET_WORDS = set(STREET_TYPE_CANON) | set(DIRECTIONALS) | {
    "apt", "unit", "ste", "suite", "bldg", "building", "no",
}


def street_tokens(street: str) -> list[str]:
    """Split a street into words, dropping the punctuation sources sprinkle in."""
    return [t for t in re.split(r"[\s,]+", street.replace(".", " ").strip()) if t]


def truncate_at_street_type(tokens: list[str]) -> list[str] | None:
    """Keep through the last street type plus a trailing directional.

    Returns None when no street type is present, since then there is no
    reliable boundary and guessing would merge distinct buildings.
    """
    last = None
    for i, t in enumerate(tokens):
        if t.lower().strip("#-") in STREET_TYPE_CANON:
            last = i
    if last is None:
        return None
    end = last + 1
    if end < len(tokens) and tokens[end].lower().strip("#-") in DIRECTIONALS:
        end += 1
    return tokens[:end]


def clean_street(address: str) -> str:
    """The street portion of an address, minus any unit designator."""
    street = unescape((address or "").split(",")[0])
    truncated = truncate_at_street_type(street_tokens(street))
    if truncated is not None:
        return " ".join(truncated)

    # No recognisable street type — fall back to the explicit designator forms.
    # "#" cannot follow \b, since it is not a word character.
    street = re.sub(r"\s*[-–]\s*(?=[\w/-]*\d)[\w/-]+\s*$", "", street)
    street = re.sub(r"(?:\b(?:apt|unit|ste|suite|bldg)\b|#)\s*[\w-]+\s*$", "", street, flags=re.I)
    return re.sub(r"\s{2,}", " ", street).strip(" ,-#")


def normalize_street_for_key(street: str) -> str:
    """Spelling-independent form, so "Ave." and "Avenue" identify one building."""
    out = []
    for t in street_tokens((street or "").lower()):
        t = re.sub(r"[^a-z0-9]", "", t)
        if not t:
            continue
        out.append(STREET_TYPE_CANON.get(t) or DIRECTIONALS.get(t) or t)
    return " ".join(out)


def split_city_state(address: str) -> tuple[str | None, str | None]:
    m = CITY_STATE_RE.search(address or "")
    if not m:
        return None, None
    return m.group(1).strip().title(), m.group(2).upper()


def street_words(address: str) -> set[str]:
    """Identifying words of a street address: no number, no street type."""
    street = (address or "").split(",")[0].lower()
    words = re.findall(r"[a-z0-9]+", street)
    return {w for w in words if w not in GENERIC_STREET_WORDS and not w.isdigit()}


def street_directionals(address: str) -> set[str]:
    """Compass parts of a street, canonicalised ("North" and "N" are one)."""
    street = (address or "").split(",")[0].lower()
    return {DIRECTIONALS[w] for w in re.findall(r"[a-z]+", street) if w in DIRECTIONALS}


def address_key(address: str, city: str | None = None) -> str:
    """Cross-source identity for a building: normalized street plus city.

    Used to recognise that a WSHFC row, a HUD row and an existing property are
    the same building, so ingests can skip rather than duplicate.
    """
    parsed_city, _state = split_city_state(address)
    resolved = (city or parsed_city or "").strip().lower()
    return f"{normalize_street_for_key(clean_street(address))}|{resolved}"
