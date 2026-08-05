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
- Skips anti-bot interstitials rather than parsing them into junk rows. Some sites (notably the Bellwether Housing subdomains) sit behind a Cloudflare challenge; where it does not clear on its own, those listings are simply not collected — the challenge is not circumvented
- Stores unit listings in the database with foreign key to properties
- Runs with configurable concurrency (default: 10 workers)

**AppFolio master portals** (`python main.py appfolio`, `APPFOLIO_MASTER_URLS` in
`config.py`): many Seattle PM companies publish every building they manage at
`<company>.appfolio.com/listings`. Scraping the portal directly reaches all of
their buildings, not just the one whose own site embeds the widget, and matches
them back to properties by street address. 26 portals currently produce matches,
covering 230 properties.

To find more, two passes work well: sweep every `properties.website` for
`*.appfolio.com` (catches portals the per-site scraper missed because they had no
vacancy at the time), and web-search for Seattle AppFolio listing portals. Verify
a candidate matches at least one property before adding it.

**Statewide listings.** The same run keeps the Washington listings that match no
Seattle-dataset building, instead of discarding them, so the app covers the rest
of the state. They become properties of their own with `data_source = 'appfolio'`,
`program = 'Market Rate'`, and coordinates read from each portal's inline
`markers` array (the only place AppFolio publishes lat/long). Unit-level
addresses are collapsed to one property per building, and ids are negative
SHA-1 derivations of the building key — the Seattle dataset's ids are positive
parcel numbers, so the two spaces cannot collide. Rows that stop being
advertised are deleted on the next run, since they only exist while a portal
lists them.

These carry **no affordability data** — no AMI, no MFTE/IZ/MHA, no income
restrictions — and cover only the PM companies in `APPFOLIO_MASTER_URLS`, so
they are supplementary to the curated Seattle stock rather than a statewide
affordable-housing dataset. The list view sorts them below it for that reason.

### MFTE / IZ / MHA Buildings

Fetches all market-rate buildings offering affordable units under the MFTE (Multifamily Tax Exemption), IZ (Incentive Zoning), and MHA (Mandatory Housing Affordability) programs:

```bash
python main.py affordable          # aliases: mfte, mha
```

**What it does:**
- Queries the Office of Housing's `GIS_Renters_Map_Affordable_Units` ArcGIS layer (~340 buildings) — the city publishes all three programs in one dataset
- Captures per-building MFTE/IZ/MHA unit counts, AMI levels per bedroom size, and per-program expiration dates (MHA units are typically restricted ~75 years, e.g. "2037 (MFTE) 2097 (MHA)")
- Matches each building to the main `properties` table by address/name and stores in `affordable_buildings`

### Income & Rent Limits

Downloads and parses the official Seattle Office of Housing income & rent limit schedules (PDFs, updated annually each May):

```bash
python main.py rentlimits
```

**What it does:**
- Fetches three schedules: **MILU** (applies to MHA, Incentive Zoning, MFTE P3–P5), **MFTE P6**, and **MFTE P7**
- Parses the maximum-rent table (unit size × %AMI) into the `rent_limits` table
- Parses the income-limits table (family size × %AMI) into the `income_limits` table

### Availability Dates

Every scraped unit gets its availability normalized into a comparable form, stored alongside the raw text:

| column | meaning |
|---|---|
| `available_from` | raw text as published, e.g. `"Now"`, `"8/17/26"`, `"Waitlist Closed 6/5/2026"` |
| `available_date` | normalized ISO date (`YYYY-MM-DD`), or empty when no date was published |
| `availability_status` | `now` · `future` · `waitlist` · `unknown` |
| `is_current` | `1` for the newest scrape of a property, `0` for retained history |
| `source` | which ingest path wrote the row (`site`, `appfolio-master`, `lihi`) |

Normalization lives in `availability.py` and handles the formats these sites actually use — `9/1/26`, `09/01/2026`, `2026-09-01`, `Sept 1st`, `September 1, 2026`, `Available Now`, `Move-in ready`, `Jan 2026` — plus anti-patterns that must *not* become dates (`parking available 24/7`, `3 available units`). Dates published without a year roll forward to the next occurrence.

**Snapshot semantics:** re-scraping never mixes old and new listings. Each run marks its rows `is_current = 1` and demotes that property's previous rows from the same source, so live-availability queries stay clean while history is preserved. Currency is scoped per source because the per-site scraper and the AppFolio portal scraper both write units for the same property.

```sql
-- units available now or soon, freshest first
SELECT * FROM units
WHERE is_current = 1 AND availability_status IN ('now', 'future')
ORDER BY available_date;
```

### LIHI Waitlist Status

```bash
python main.py lihi
```

LIHI operates ~37 buildings in this dataset. They are fully affordable, so availability is published as waitlist status rather than per-unit vacancy. All their buildings appear on one server-rendered index page, so a single request covers the portfolio.

**Note on coverage:** only a handful of LIHI buildings publish a status at any given time, and only some of those are Seattle properties in this dataset — a small yield is the expected result, not a failure.

### Qualification Info

Computes, per building and bedroom size, what an affordable unit rents for and what household income qualifies — the same numbers leasing offices quote (e.g. "1BR $1,233/mo at 40% AMI, max income $46,040 for a household of 1"):

```bash
python main.py qualify
```

**What it does:**
- Joins each building's AMI-by-bedroom data against the official rent & income schedules into `unit_qualifications`
- MHA and IZ units follow the MILU schedule; the MFTE phase (P6/P7/MILU) is estimated from the exemption's 12-year term
- Re-runs automatically after `affordable` and `rentlimits`
- Shown in the web app's property modal as an "Affordable Unit Qualification" card

### Website Affordable-Housing Pages

Scrapes each affordable building's own website for publicly posted MFTE/MHA info:

```bash
python main.py pages              # all buildings (throttled, ~15 min)
python main.py pages --limit 20   # test run
```

**What it does:**
- Fetches the homepage plus up to 4 likely subpages (affordable housing, floor plans, leasing) per site
- Records program mentions (MFTE/MHA/affordable), waitlist mentions, posted AMI percentages, and a context snippet into `affordable_page_info`
- Read-only and polite: robots.txt-aware, throttled, no forms or contact — automated outreach stays disabled by design


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
- `output/affordable_buildings.csv` - MFTE/IZ/MHA buildings with unit counts and AMI levels
- `output/affordable_units_by_program.csv` - One row per building × program (MFTE/IZ/MHA) with unit count, per-program expiration, and the rent-limit schedule that applies (MHA/IZ follow MILU)
- `output/unit_qualifications.csv` - Per building × bedroom × program: max affordable rent and qualifying income limits (household of 1–4)
- `output/affordable_page_info.csv` - Per building: MFTE/MHA/waitlist mentions found on the property's own website
- `output/rent_limits.csv` - Official maximum rents by program, unit size, and %AMI

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

Open [http://localhost:0616](http://localhost:0616) to view the application.

**Features:**
- **Interactive Map** - Leaflet map with color-coded markers (amber: Mixed Market, violet: Fully Affordable)
- **Filter Bar** - Search by text, neighborhood, program type, bedroom count, rent range
- **Incentive Program Filter** - Narrow to MFTE (313), Incentive Zoning (49) or MHA (29)
  buildings, or to the properties in **none** of them. Note that statewide market-rate
  rows also qualify as "none"; combine with *Fully Affordable* for the 411 LIHTC /
  project-based Section 8 / city-funded buildings
- **Property Type** - *Any Property Type* (2,018), *Mixed Market* (343),
  *Fully Affordable* (414), or *Market Rate* (1,261 statewide AppFolio buildings)
- **City Filter** - 55 Washington cities; selecting one recentres the map on it.
  The neighborhood filter stays Seattle-only, since only that dataset has them
- **Property Cards** - Show building info, AMI levels, unit types, live pricing badges
- **Property Modal** - Detailed view with unit table, contact links, mini-map.
  Each unit row deep-links to that exact apartment's listing page, while the
  website button goes to the property management landing page
- **Favorites** - Heart any property to save it; the Favorites pill filters to
  your saved list. Stored per-browser in localStorage, since there are no accounts
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

## Deploying to Vercel

The frontend queries the SQLite file directly via `sql.js`, so the database ships with the deployment rather than living on a separate server.

**Project settings:** set **Root Directory** to `web`. Everything else is default — the framework preset detects Next.js. There is intentionally no `vercel.json`; the settings live in the dashboard.

**How the data reaches the serverless function:**
- `web/data/seattle_housing.db` is committed on purpose (see the note in `.gitignore`) — Vercel has no persistent filesystem, so the database has to be part of the build.
- `next.config.mjs` traces both the database and `sql-wasm.wasm` into the function bundle via `outputFileTracingIncludes`. Without that, the files are pruned and every API route 500s.
- Both API routes pin `runtime = 'nodejs'`. They read from disk, which Edge cannot do.
- `lib/db.js` locates the wasm through `require.resolve('sql.js')` rather than assuming `process.cwd()`, because a serverless function's working directory is not guaranteed to be the project root. If an asset is ever missing it throws with every path it tried, instead of a bare `ENOENT`.

**Publishing refreshed data** — the database is a build artifact, so new scrapes only go live when the file is committed:

```bash
python main.py all          # refresh everything
python main.py stats        # sanity-check the numbers
git add web/data/seattle_housing.db && git commit -m "chore: refresh housing data"
git push                    # Vercel redeploys automatically
```

Run `sqlite3 web/data/seattle_housing.db "VACUUM;"` before committing to keep the file (and the git history) smaller. Note that each refresh adds another copy of a multi-megabyte binary to history; if that becomes unwieldy, generating the database during the build is the alternative.

**Verifying a build locally before pushing:**

```bash
cd web && npm run build && npm start
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
