# Seattle Affordable Housing Scraper

A full-stack application that scrapes, stores, and visualizes affordable housing data for Seattle. The system fetches ~742 affordable housing properties from the City of Seattle's ArcGIS server, discovers and validates property websites, scrapes those websites for live unit availability and pricing, and displays everything through an interactive web interface with map-based exploration.

## Architecture Overview

The project consists of two main components:

1. **Python Scraper Backend** - Multi-stage pipeline that fetches properties, discovers websites, and legally scrapes public unit data
2. **Next.js Web Frontend** - Interactive UI with Leaflet map, filterable listings, and detailed property views

```
SeattleHousingScrapper/
├── main.py                    # CLI entry point (7 commands)
├── config.py                  # Configuration and constants
├── models.py                  # Data classes (Property, UnitListing)
├── db.py                      # SQLite database layer
├── requirements.txt           # Python dependencies
├── .env.example               # Environment variable template
├── scrapers/
│   ├── arcgis.py              # Fetches properties from ArcGIS FeatureServer
│   ├── website_discovery.py   # Validates/discovers property websites
│   └── property_scraper.py    # Scrapes property websites for unit data
├── data/
│   └── seattle_housing.db     # SQLite database (created after fetch)
├── output/                    # Exported data (CSV/JSON)
└── web/                       # Next.js frontend application
    ├── app/                   # Next.js App Router pages
    ├── components/            # React components (Map, Filters, Cards, Modal)
    ├── lib/                   # Database queries (better-sqlite3)
    └── api/                   # REST API routes
```

## Quick Start

### Prerequisites

- Python 3.10+
- Node.js 18+
- npm or yarn

### Python Scraper Setup

```bash
# Create and activate virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Install Playwright browsers (first time only)
playwright install chromium

# Configure environment (optional)
cp .env.example .env
```

### Web Frontend Setup

```bash
cd web
npm install
```

## Usage

### Scraper Pipeline

The scraper follows a 4-stage waterfall pipeline. Each stage builds on the previous one:

#### Stage 1: Fetch Properties from ArcGIS

Pulls all ~742 affordable housing properties from Seattle's public ArcGIS FeatureServer:

```bash
python main.py fetch
```

**What it does:**
- Queries the ArcGIS API endpoint (`GIS_Renters_Map_Update_202605`)
- Parses property data: building name, address, neighborhood, AMI levels, unit counts, coordinates, phone, website URL
- Stores everything in SQLite (`data/seattle_housing.db`)

#### Stage 2: Discover & Validate Websites

For properties without a website URL, searches DuckDuckGo to find their official site. For properties with a URL, validates it's reachable:

```bash
python main.py discover
```

**What it does:**
- Validates existing website URLs with HEAD/GET requests
- Searches DuckDuckGo for properties missing websites using: `"{building_name}" "{address}" Seattle apartments`
- Filters out listing aggregators (Zillow, Apartments.com, Trulia, etc.)
- Updates `website_status` and `website_discovered` fields in the database

#### Stage 3: Scrape Property Websites

Visits each property's website to extract live unit availability, pricing, and square footage:

```bash
python main.py scrape              # Scrape all properties
python main.py scrape --limit 10   # Test with 10 properties
```

**What it does:**
- Uses httpx for fast static site scraping
- Falls back to Playwright for JavaScript-heavy sites
- Detects property management platform iframes (AppFolio, Entrata, Yardi, RealPage, Knock) and queries them directly
- Extracts: unit type (studio, 1BR, 2BR, 3BR), rent range, square footage, availability date, amenities
- Stores unit listings in the database with foreign key to properties
- Runs with configurable concurrency (default: 10 workers)


### Running the Full Pipeline

Run all scraping stages in sequence:

```bash
python main.py all                 # Full pipeline
python main.py all --limit 10      # Full pipeline with scrape limit
```

### Exporting Data

Export scraped data to CSV and JSON formats:

```bash
python main.py export
```

**Output files:**
- `output/results.csv` - Merged view: one row per unit listing with property info
- `output/results.json` - Same data in JSON format
- `output/properties.csv` - All properties from the database

### Database Statistics

View current scraping progress:

```bash
python main.py stats
```

**Example output:**
```
Properties: 742
  Websites OK: 523  |  Unreachable: 89
Unit listings scraped: 1,247  (with rent data: 892)
```

### Web Frontend

Start the development server:

```bash
cd web
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

**Features:**
- **Interactive Map** - Leaflet map with color-coded markers (amber: Mixed Market, violet: Fully Affordable)
- **Filter Bar** - Search by text, neighborhood, program type, bedroom count, rent range
- **Property Cards** - Show building info, AMI levels, unit types, live pricing badges
- **Property Modal** - Detailed view with unit table, contact links, mini-map
- **View Modes** - Split view, list-only, or map-only
- **Pagination** - 48 properties per page

**Production build:**
```bash
npm run build
npm run start
```

## Configuration

### Environment Variables

Create a `.env` file in the project root (copy from `.env.example`):

| Variable | Default | Description |
|----------|---------|-------------|
| `USER_AGENT` | Chrome 125 on macOS | HTTP request User-Agent header |
| `SCRAPE_CONCURRENCY` | 10 | Max concurrent scraping workers |
| `REQUEST_TIMEOUT` | 30 | HTTP request timeout in seconds |

### Key Configuration (config.py)

- **ArcGIS API URL**: Seattle's public FeatureServer endpoint
- **Database path**: `data/seattle_housing.db`
- **Output directory**: `output/`
- **Skip domains**: List of aggregator domains to exclude during website discovery (Zillow, Apartments.com, Trulia, Redfin, etc.)

## Data Model

### Properties Table

One row per building. Key fields:
- `id` - ArcGIS ID (primary key)
- `building_name`, `address`, `neighborhood`
- `amis` - Area Median Income levels
- `br_types` - Bedroom types available
- `income_restricted_units`, `total_units`
- `website`, `website_status`, `website_discovered`
- `phone`, `latitude`, `longitude`
- `expiration_date`

### Units Table

Multiple rows per property (one per scraped unit listing):
- `property_id` - Foreign key to properties
- `unit_type` - Studio, 1BR, 2BR, 3BR, etc.
- `rent_min`, `rent_max` - Rent range
- `sqft_min`, `sqft_max` - Square footage range
- `available_date` - Availability date
- `description`, `amenities`

## Scraping Strategies

### Property Website Scraper (property_scraper.py)

Multi-strategy approach for maximum data extraction:

1. **Static sites** - Fast httpx requests with HTML parsing
2. **JavaScript sites** - Playwright browser automation for JS-rendered content
3. **Platform detection** - Identifies property management systems (AppFolio, Entrata, Yardi, RealPage, Knock) and queries their APIs directly for structured data
4. **Availability page discovery** - Scans navigation links to find floor plan/availability pages
5. **Data extraction**:
   - Unit type detection via regex patterns
   - Rent extraction (strips deposits, validates $400-$20,000 range)
   - Square footage extraction (NNN sq ft patterns, 100-5000 range)
   - Availability detection ("available now" or date patterns)
   - Description extraction (first substantive paragraph >80 chars)

### Website Discovery (website_discovery.py)

- Validates existing URLs with retry logic (tenacity)
- DuckDuckGo search for missing websites
- Filters aggregator domains to find official property sites
- Picks first non-aggregator result from search

## Project Structure (Graphify Analysis)

The codebase is organized into 16 main communities:

**Backend (Python):**
- **CLI Commands** - Entry point with 7 subcommands (fetch, discover, scrape, all, export, stats, contact)
- **Database Layer** - SQLite operations with WAL mode, connection pooling
- **ArcGIS Fetcher & Models** - Property data models and ArcGIS API integration
- **Property Scraper Pipeline** - Multi-strategy website scraping with platform detection
- **Website Discovery** - URL validation and DuckDuckGo search

**Frontend (Next.js):**
- **API Routes & Database Queries** - REST endpoints with filtered queries
- **Main Page Layout** - Split-view with filters, cards, and map
- **Map Component** - Leaflet integration with color-coded markers
- **Property Card Component** - Listing cards with badges and pricing
- **Property Modal Component** - Detail view with unit table
- **Filter Bar Component** - Search and filter controls

## Dependencies

### Python

| Package | Purpose |
|---------|---------|
| `httpx[http2]>=0.27` | Async HTTP client for fast scraping |
| `playwright>=1.44` | Browser automation for JS-heavy sites |
| `beautifulsoup4>=4.12` | HTML parsing |
| `lxml>=5.2` | Fast HTML/XML parser backend |
| `ddgs>=0.1` | DuckDuckGo search API |
| `python-dotenv>=1.0` | Environment variable loading |
| `rich>=13.7` | Rich console output |
| `tenacity>=8.3` | Retry logic |
| `pandas>=2.2` | Data export to CSV/JSON |

### Node.js

| Package | Purpose |
|---------|---------|
| `next@14.2.30` | React framework (App Router) |
| `react@18.3.1` | UI library |
| `better-sqlite3@11.10.0` | SQLite bindings (read-only) |
| `leaflet@1.9.4` | Interactive map library |
| `tailwindcss@3.4.17` | CSS framework |

## Common Workflows

### First-Time Setup

```bash
# 1. Setup Python
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium

# 2. Setup Web
cd web && npm install && cd ..

# 3. Run full pipeline
python main.py all

# 4. Export data
python main.py export

# 5. Start web UI
cd web && npm run dev
```

### Testing with Limited Data

```bash
# Scrape only 10 properties
python main.py scrape --limit 10

# Check results
python main.py stats
```

### Regular Updates

```bash
# Re-fetch latest properties from ArcGIS
python main.py fetch

# Re-scrape websites for new availability data
python main.py scrape

# Export updated data
python main.py export
```

## Output Files

After running the pipeline:

| File | Content |
|------|---------|
| `data/seattle_housing.db` | SQLite database with properties and units |
| `output/results.csv` | Merged unit+property data (one row per unit) |
| `output/results.json` | Same data in JSON format |
| `output/properties.csv` | All properties |

## Troubleshooting

### Playwright Issues

```bash
# Reinstall browsers
playwright install chromium

# Install system dependencies (Linux)
playwright install-deps
```

### Database Locked Errors

The database uses WAL mode for better concurrency. If you encounter lock errors:
- Ensure only one scraper process is running
- The web frontend uses read-only mode, so it won't cause locks

### No Websites Found

- Check that DuckDuckGo search is accessible from your network
- Verify `SKIP_DOMAINS` in config.py isn't too aggressive
- Run `python main.py stats` to see website discovery results

### Web Frontend Issues

```bash
# Clear Next.js cache
cd web
rm -rf .next
npm run dev

# Reinstall dependencies
rm -rf node_modules
npm install
```

## Ethical & Legal Disclaimer

This project is intended strictly for **educational and research purposes**. 
To ensure legal and ethical compliance with scraping guidelines (such as the CFAA and trespass to chattels), the project has been modified to:
- Clearly identify itself with a custom `User-Agent`.
- Adhere to `robots.txt` guidelines before attempting to scrape.
- Use explicit rate limiting (delays) to prevent server overload.
- Only scrape publicly available factual data (no logins, bypassing CAPTCHAs, or unauthorized access).
- Omit any automated form submissions or "spamming" of property managers.

Please do not use this code for commercial purposes or to build a competitive platform without explicit permission from the data owners.
