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
class UnitListing:
    property_id: int
    unit_type: str           # studio, 1br, 2br, 3br, micro
    sqft: Optional[int]
    rent_min: Optional[int]
    rent_max: Optional[int]
    available_count: Optional[int]
    available_from: Optional[str]
    property_description: Optional[str]
    amenities: Optional[str]
    scraped_at: str
    source_url: Optional[str] = None
