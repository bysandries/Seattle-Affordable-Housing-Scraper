import os
from dotenv import load_dotenv

load_dotenv()

ARCGIS_FEATURE_URL = (
    "https://services.arcgis.com/ZOyb2t4B0UYuYNYH/arcgis/rest/services"
    "/GIS_Renters_Map_Update_202605/FeatureServer/1/query"
)

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
    "https://westfreemanprop.appfolio.com/listings/"
]
