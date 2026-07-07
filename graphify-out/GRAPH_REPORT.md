# Graph Report - /Users/bysandries/Developer/Web/SeattleHousingScrapper  (2026-07-07)

## Corpus Check
- Corpus is ~12,590 words - fits in a single context window. You may not need a graph.

## Summary
- 125 nodes · 168 edges · 21 communities (16 shown, 5 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 4 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Property Scraper Pipeline|Property Scraper Pipeline]]
- [[_COMMUNITY_Web Package Dependencies|Web Package Dependencies]]
- [[_COMMUNITY_API Routes & Database Queries|API Routes & Database Queries]]
- [[_COMMUNITY_Database Layer|Database Layer]]
- [[_COMMUNITY_CLI Commands|CLI Commands]]
- [[_COMMUNITY_Website Discovery|Website Discovery]]
- [[_COMMUNITY_Contact Inquiry System|Contact Inquiry System]]
- [[_COMMUNITY_Property Card Component|Property Card Component]]
- [[_COMMUNITY_ArcGIS Fetcher & Models|ArcGIS Fetcher & Models]]
- [[_COMMUNITY_Filter Bar Component|Filter Bar Component]]
- [[_COMMUNITY_Property Modal Component|Property Modal Component]]
- [[_COMMUNITY_JS Configuration|JS Configuration]]
- [[_COMMUNITY_Main Page Layout|Main Page Layout]]
- [[_COMMUNITY_App Layout & Metadata|App Layout & Metadata]]
- [[_COMMUNITY_Map Component|Map Component]]
- [[_COMMUNITY_Next.js Config|Next.js Config]]

## God Nodes (most connected - your core abstractions)
1. `_scrape_property()` - 8 edges
2. `run()` - 7 edges
3. `_parse_appfolio_html()` - 7 edges
4. `_parse_units_from_html()` - 7 edges
5. `UnitListing` - 6 edges
6. `_parse_text_for_units()` - 6 edges
7. `getDb()` - 5 edges
8. `_process_row()` - 5 edges
9. `_contact_property()` - 5 edges
10. `run_async()` - 5 edges

## Surprising Connections (you probably didn't know these)
- `cmd_contact()` --calls--> `run()`  [EXTRACTED]
  main.py → scrapers/contact_inquiry.py
- `_parse_property()` --calls--> `Property`  [EXTRACTED]
  scrapers/arcgis.py → models.py
- `_parse_appfolio_html()` --calls--> `UnitListing`  [EXTRACTED]
  scrapers/property_scraper.py → models.py
- `_parse_text_for_units()` --calls--> `UnitListing`  [EXTRACTED]
  scrapers/property_scraper.py → models.py
- `_parse_units_from_html()` --calls--> `UnitListing`  [EXTRACTED]
  scrapers/property_scraper.py → models.py

## Communities (21 total, 5 thin omitted)

### Community 0 - "Property Scraper Pipeline"
Cohesion: 0.28
Nodes (16): _extract_description(), _extract_rents(), _extract_sqft(), _fetch_html_httpx(), _fetch_html_playwright(), _find_availability_url(), _find_pm_iframe(), _is_js_shell() (+8 more)

### Community 1 - "Web Package Dependencies"
Cohesion: 0.12
Nodes (16): dependencies, better-sqlite3, leaflet, next, react, react-dom, devDependencies, autoprefixer (+8 more)

### Community 2 - "API Routes & Database Queries"
Cohesion: 0.33
Nodes (7): GET(), getDb(), getMapProperties(), getNeighborhoods(), getProperties(), getPropertyById(), GET()

### Community 3 - "Database Layer"
Cohesion: 0.24
Nodes (3): db_conn(), get_connection(), init_db()

### Community 4 - "CLI Commands"
Cohesion: 0.36
Nodes (6): run(), cmd_all(), cmd_contact(), cmd_discover(), cmd_fetch(), cmd_scrape()

### Community 5 - "Website Discovery"
Cohesion: 0.42
Nodes (8): _domain(), _ensure_scheme(), _is_aggregator(), _process_row(), run(), _run_async(), _search_website(), _validate_url()

### Community 6 - "Contact Inquiry System"
Cohesion: 0.50
Nodes (7): _contact_property(), _fill_form(), _get_label_for_input(), _get_target_properties(), run_async(), _should_skip(), _try_chat()

### Community 7 - "Property Card Component"
Cohesion: 0.47
Nodes (4): BEDROOM_LABELS, parseAvailableTypes(), parseBrTypes(), PropertyCard()

### Community 8 - "ArcGIS Fetcher & Models"
Cohesion: 0.53
Nodes (4): fetch_all_properties(), _parse_property(), run(), Property

### Community 9 - "Filter Bar Component"
Cohesion: 0.40
Nodes (3): BEDROOM_OPTIONS, PROGRAM_OPTIONS, RENT_PRESETS

### Community 11 - "JS Configuration"
Cohesion: 0.40
Nodes (4): compilerOptions, baseUrl, paths, @/*

## Knowledge Gaps
- **25 isolated node(s):** `baseUrl`, `@/*`, `nextConfig`, `name`, `private` (+20 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `run()` connect `Property Scraper Pipeline` to `CLI Commands`?**
  _High betweenness centrality (0.080) - this node is a cross-community bridge._
- **Why does `run()` connect `CLI Commands` to `Contact Inquiry System`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **Why does `run()` connect `Website Discovery` to `CLI Commands`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **What connects `baseUrl`, `@/*`, `nextConfig` to the rest of the system?**
  _25 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Web Package Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.11764705882352941 - nodes in this community are weakly interconnected._