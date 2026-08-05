from dataclasses import dataclass, field
from typing import Optional


@dataclass
class Property:
    id: int
    building_name: str
    address: str
    neighborhood: str
    program: str
    owner_management: str
    phone: str
    website: str
    total_units: int
    income_restricted_units: int
    amis: str
    br_types: str
    expiration_date: str
    lat: float
    long: float
    # resolved/validated website fields (set during discovery step)
    website_discovered: Optional[str] = None
    website_status: Optional[str] = None
    last_fetched_at: Optional[str] = None


@dataclass
class AppfolioProperty:
    """A building harvested from an AppFolio portal that is not in the Seattle
    Office of Housing dataset — i.e. statewide market-rate inventory.

    `id` is negative and derived from the address so it stays stable across runs
    and cannot collide with the positive parcel ids of the Seattle dataset.
    """
    id: int
    building_name: str
    address: str
    city: str
    state: str
    website: str
    br_types: str
    lat: float
    long: float
    owner_management: str = ""
    last_fetched_at: Optional[str] = None


@dataclass
class AffordableBuilding:
    """Market-rate building with affordable units (MFTE / IZ / MHA)."""
    building_name: str
    address: str
    neighborhood: str
    phone: str
    website: str
    total_units: int
    total_mfte_units: int
    total_iz_units: int
    total_mha_units: int
    total_affordable_units: int
    expiration_date: str
    micro_ami: str
    studio_ami: str
    one_br_ami: str
    two_br_ami: str
    three_br_ami: str
    amis: str
    br_types: str
    has_mfte: bool
    has_iz: bool
    has_mha: bool
    lat: float
    long: float
    property_id: Optional[int] = None  # matched properties.id, if found
    last_fetched_at: Optional[str] = None


@dataclass
class RentLimit:
    program: str        # MILU (MHA/IZ/MFTE P3-P5), MFTE_P6, MFTE_P7
    unit_size: str      # "0-Bedroom" .. "4-Bedroom"
    ami_pct: int        # percent of area median income
    max_rent: int       # max monthly rent incl. fees and basic utilities
    effective_date: str
    source_url: str
    fetched_at: str


@dataclass
class IncomeLimit:
    program: str
    family_size: int
    ami_pct: int
    max_income: int     # max annual household income
    effective_date: str
    source_url: str
    fetched_at: str


@dataclass
class UnitQualification:
    """Computed qualification info: what an affordable unit costs and who qualifies."""
    building_id: int
    property_id: Optional[int]
    building_name: str
    bedroom: str            # Micro, Studio, 1-Bedroom, 2-Bedroom, 3-Bedroom
    program: str            # MFTE, IZ, MHA
    rent_schedule: str      # MILU, MFTE_P6, MFTE_P7
    ami_pct: int
    max_rent: Optional[int]
    income_limit_1: Optional[int]   # max annual income, household of 1
    income_limit_2: Optional[int]
    income_limit_3: Optional[int]
    income_limit_4: Optional[int]
    computed_at: str


@dataclass
class AffordablePageInfo:
    """Signals found on a property's own website about its affordable units."""
    building_id: int
    property_id: Optional[int]
    building_name: str
    website: str
    pages_checked: int
    mentions_mfte: bool
    mentions_mha: bool
    mentions_affordable: bool
    has_waitlist_mention: bool
    ami_mentions: str       # e.g. "40, 60"
    info_url: str           # most relevant page found
    snippet: str            # text excerpt around the program/waitlist mention
    status: str             # ok | no_website | error
    scraped_at: str


@dataclass
class UnitListing:
    property_id: int
    unit_type: str           # studio, 1br, 2br, 3br, micro
    sqft: Optional[int]
    rent_min: Optional[int]
    rent_max: Optional[int]
    available_count: Optional[int]
    available_from: Optional[str]   # raw text as published, e.g. "Now", "9/1/26"
    property_description: Optional[str]
    amenities: Optional[str]
    scraped_at: str
    source_url: Optional[str] = None
    # Deep link to this specific unit's listing page, when the source has one.
    # source_url is the portal index; this is the individual apartment.
    listing_url: Optional[str] = None
    # normalized availability, derived from available_from by availability.py
    available_date: Optional[str] = None      # ISO YYYY-MM-DD, or None
    availability_status: Optional[str] = None  # now | future | waitlist | unknown
