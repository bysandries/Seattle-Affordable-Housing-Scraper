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

# Statewide affordable housing, covering all 39 counties rather than Seattle
# alone. WSHFC has the richer attributes (AMI bands, unit mix, county, and a
# project website for roughly half of them) but publishes no coordinates; the
# HUD layer covers the same LIHTC portfolio with geometry, so the two are joined
# on address. The WSHFC filename carries a revision date and changes when they
# republish — relink from https://www.wshfc.org/managers/resources.htm
WSHFC_PROPERTY_LIST_URL = (
    "https://www.wshfc.org/managers/Other/Active%20Project%20List_forwebsite_2-2-26.xlsx"
)
HUD_LIHTC_FEATURE_URL = (
    "https://egis.hud.gov/arcgis/rest/services/hrl/HudResourceLocator/MapServer/3/query"
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

# AppFolio portals for PM companies operating in Seattle. Scraping the master
# portal reaches every building a company manages, not just the one property
# whose own site happens to embed the widget — so these are worth listing even
# when the per-site scraper already covers one of their buildings.
#
# Found two ways: sweeping every property website in the DB for *.appfolio.com,
# and searching the web for Seattle AppFolio listing portals. Each was verified
# to return listings that fuzzy-match at least one property in our dataset.
# Ordered by how many units they matched at discovery (2026-08-04).
APPFOLIO_MASTER_URLS = [
    "https://incitypropertyholdings.appfolio.com/listings/",
    "https://redside.appfolio.com/listings/",
    "https://arboreal.appfolio.com/listings/",
    "https://westfreemanprop.appfolio.com/listings/",
    "https://guidemanagement.appfolio.com/listings/",
    "https://pacificcrest.appfolio.com/listings/",
    "https://olympicmanagement.appfolio.com/listings/",
    "https://cornellandassociates.appfolio.com/listings/",
    "https://kozproperties.appfolio.com/listings/",
    "https://rpa.appfolio.com/listings/",
    "https://maingatemgmt.appfolio.com/listings/",
    "https://mapleleafmanagement.appfolio.com/listings/",
    "https://wallspropmgmt.appfolio.com/listings/",
    "https://northwest.appfolio.com/listings/",
    "https://westlakeassociatesinc.appfolio.com/listings/",
    "https://pacificcrestre.appfolio.com/listings/",
    "https://milestoneproperties.appfolio.com/listings/",
    "https://pilotnw.appfolio.com/listings/",
    "https://davis.appfolio.com/listings/",
    "https://ballardpm.appfolio.com/listings/",
    "https://hunters.appfolio.com/listings/",
    "https://spma.appfolio.com/listings/",
    "https://livingbode.appfolio.com/listings/",
    "https://hive.appfolio.com/listings/",
    "https://pacificviewrealestate.appfolio.com/listings/",
    "https://moormanproperties.appfolio.com/listings/",
    # Currently empty or all-unmatched, but each was found embedded on a
    # property's own website, so they manage buildings in the dataset and will
    # match once they post a vacancy.
    "https://junctionflats.appfolio.com/listings/",
    "https://cliffsidellc.appfolio.com/listings/",
]

# Official websites for individual buildings found via an AppFolio portal.
# The portal only exposes its own listing-detail URL, so a building's real site
# is recorded here and used in preference. Keyed by the normalized building key
# that scrapers.appfolio_master._building_key produces: "street|city|state".
#
# Note these sites are not scraped directly — their availability pages are
# JavaScript widgets fed by the same AppFolio portal, so the portal is both the
# cheaper and the more complete source. This only fixes where the app links to.
PROPERTY_SITE_OVERRIDES = {
    "4301 alderwood mall boulevard|lynnwood|WA": "https://www.kozonalderwoodmallblvd.com/availability",
}
