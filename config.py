import os
from dotenv import load_dotenv

load_dotenv()

ARCGIS_FEATURE_URL = (
    "https://services.arcgis.com/ZOyb2t4B0UYuYNYH/arcgis/rest/services"
    "/GIS_Renters_Map_Update_202605/FeatureServer/1/query"
)

# Market-rate buildings with affordable units (MFTE / IZ / MHA), unit counts
# and AMI levels per bedroom size. Published by Seattle Office of Housing.
AFFORDABLE_UNITS_FEATURE_URL = (
    "https://services.arcgis.com/ZOyb2t4B0UYuYNYH/arcgis/rest/services"
    "/GIS_Renters_Map_Affordable_Units_Q2_25/FeatureServer/0/query"
)

# Official income & rent limit schedules (Seattle Office of Housing).
# MILU covers MHA, Incentive Zoning, MFTE P3-P5, and other market-incentive units.
RENT_LIMIT_PDFS = {
    "MILU": (
        "https://www.seattle.gov/documents/Departments/Housing/Shared/IncomeLimits"
        "/2026-2027_MILU_Rental_IncomeLimits.pdf"
    ),
    "MFTE_P6": (
        "https://www.seattle.gov/documents/Departments/Housing/Shared/IncomeLimits"
        "/2026-2027_MFTE_P6_Rental_IncomeLimits.pdf"
    ),
    "MFTE_P7": (
        "https://www.seattle.gov/documents/Departments/Housing/Shared/IncomeLimits"
        "/2026-2027_MFTE_P7_Rental_IncomeLimits.pdf"
    ),
}

USER_AGENT = os.getenv(
    "USER_AGENT",
    "SeattleHousingScrapper/1.0 (Educational Research Project) Mozilla/5.0",
)

SCRAPE_CONCURRENCY = int(os.getenv("SCRAPE_CONCURRENCY", "2"))
REQUEST_TIMEOUT = int(os.getenv("REQUEST_TIMEOUT", "30"))
REQUEST_DELAY = float(os.getenv("REQUEST_DELAY", "2.0"))

DB_PATH = os.path.join(os.path.dirname(__file__), "web", "data", "seattle_housing.db")
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "output")

# Domains to skip when discovering websites via search (listing aggregators)
SKIP_DOMAINS = {
    "apartments.com",
    "zillow.com",
    "trulia.com",
    "redfin.com",
    "homes.com",
    "zumper.com",
    "hotpads.com",
    "rent.com",
    "apartmentlist.com",
    "realtor.com",
    "craigslist.org",
}

HEADERS = {"User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.9"}

APPFOLIO_MASTER_URLS = [
    "https://incitypropertyholdings.appfolio.com/listings/",
    "https://redside.appfolio.com/listings/",
    "https://arboreal.appfolio.com/listings/",
    "https://westfreemanprop.appfolio.com/listings/",
    "https://guidemanagement.appfolio.com/listings/"
]
