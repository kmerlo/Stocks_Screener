# Graph Report - .  (2026-06-01)

## Corpus Check
- 42 files · ~106,010 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 672 nodes · 1538 edges · 37 communities detected
- Extraction: 70% EXTRACTED · 30% INFERRED · 0% AMBIGUOUS · INFERRED: 463 edges (avg confidence: 0.56)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_API & Frontend Core|API & Frontend Core]]
- [[_COMMUNITY_Database Models & Alarms|Database Models & Alarms]]
- [[_COMMUNITY_Screening & Ticker Sources|Screening & Ticker Sources]]
- [[_COMMUNITY_Backend Architecture|Backend Architecture]]
- [[_COMMUNITY_Pydantic Schemas|Pydantic Schemas]]
- [[_COMMUNITY_UI Views & Components|UI Views & Components]]
- [[_COMMUNITY_Feature Documentation|Feature Documentation]]
- [[_COMMUNITY_System Architecture|System Architecture]]
- [[_COMMUNITY_Drawing Canvas Tools|Drawing Canvas Tools]]
- [[_COMMUNITY_Investing.com Scraper|Investing.com Scraper]]
- [[_COMMUNITY_Chart & Drawing Views|Chart & Drawing Views]]
- [[_COMMUNITY_CSV Ticker Parsing|CSV Ticker Parsing]]
- [[_COMMUNITY_Caching Performance Tests|Caching Performance Tests]]
- [[_COMMUNITY_Sub-Universe Tests|Sub-Universe Tests]]
- [[_COMMUNITY_Portfolio Tests|Portfolio Tests]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]

## God Nodes (most connected - your core abstractions)
1. `apiCall()` - 49 edges
2. `ScreeningColumn` - 48 edges
3. `Drawing` - 48 edges
4. `ScreeningValue` - 47 edges
5. `Alarm` - 47 edges
6. `FundamentalData` - 47 edges
7. `Portfolio` - 47 edges
8. `Transaction` - 47 edges
9. `PriceData` - 46 edges
10. `FinanceLogic` - 38 edges

## Surprising Connections (you probably didn't know these)
- `verify_caching()` --calls--> `delete_orphans()`  [INFERRED]
  verify_caching_v2.py → main.py
- `add_ticker_to_list()` --calls--> `Ticker`  [INFERRED]
  main.py → database.py
- `fetch_missing_ticker_names()` --calls--> `Ticker`  [INFERRED]
  main.py → database.py
- `add_screening_column()` --calls--> `ScreeningColumn`  [INFERRED]
  main.py → database.py
- `create_drawing()` --calls--> `Drawing`  [INFERRED]
  main.py → database.py

## Hyperedges (group relationships)
- **Backend Core Stack** — agantsmd_fastapi, agantsmd_uvicorn, agantsmd_sqlite, agantsmd_sqlalchemy, appuntistocksscreener_python_311 [EXTRACTED 1.00]
- **Frontend Core Stack** — appuntistocksscreener_lightweight_charts, appuntistocksscreener_spa_architecture, appuntistocksscreener_sidebar_nav, appuntistocksscreener_global_state [EXTRACTED 1.00]
- **Data Sources** — agantsmd_yfinance, appuntistocksscreener_pytickersymbols, appuntistocksscreener_selenium, appuntistocksscreener_lightweight_charts, appuntistocksscreener_gspread [EXTRACTED 1.00]
- **Drawing Tools System** — appuntistocksscreener_chart_canvas_layer, appuntistocksscreener_drawing_tools, indexhtml_drawing_toolbar, indexhtml_drawing_tools_group [EXTRACTED 1.00]
- **Portfolio Management System** — appuntistocksscreener_portfolio_view, indexhtml_transaction_modal, indexhtml_cash_modal, indexhtml_commission_plans_modal, appuntistocksscreener_flow_portfolio, appuntistocksscreener_get_portfolio_summary [EXTRACTED 1.00]
- **Screening System** — appuntistocksscreener_screenaing_view, appuntistocksscreener_screenaing_cache, appuntistocksscreener_run_modular_screening, appuntistocksscreener_run_dynamic_screening, agantsmd_screenaingsheet, agantsmd_screenaingvalue, agantsmd_processpoolexecutor [EXTRACTED 1.00]
- **All SPA Views** — appuntistocksscreener_monitoring_view, appuntistocksscreener_portfolio_view, appuntistocksscreener_screenaing_view, indexhtml_lists_view, appuntistocksscreener_sidebar_nav [INFERRED 0.85]
- **All API Groups Exposed by main.py** — appuntistocksscreener_main_py, appuntistocksscreener_api_ticker_lists, appuntistocksscreener_api_price_data, appuntistocksscreener_api_screenaing, appuntistocksscreener_api_indicators, appuntistocksscreener_api_drawings, appuntistocksscreener_api_alarms, appuntistocksscreener_api_fundamentals, appuntistocksscreener_api_ticker_mappings, appuntistocksscreener_api_portfolio, appuntistocksscreener_api_google_sheets, appuntistocksscreener_api_investing, appuntistocksscreener_api_maintenance [EXTRACTED 1.00]
- **Screening Tab Views** — indexhtml_screenaing_tabs, appuntistocksscreener_screenaing_view [EXTRACTED 1.00]

## Communities

### Community 0 - "API & Frontend Core"
Cohesion: 0.03
Nodes (140): addColumnToSheet(), addIndicator(), addManualMapping(), apiCall(), applyFundamentalSortAndFilter(), applyIndicators(), applyMappingFilters(), applyTemplate() (+132 more)

### Community 1 - "Database Models & Alarms"
Cohesion: 0.12
Nodes (65): Base, Alarm, ChartTemplate, CommissionPlan, Drawing, FundamentalData, HistoricalFundamentalData, init_db() (+57 more)

### Community 2 - "Screening & Ticker Sources"
Cohesion: 0.02
Nodes (45): ScreeningSheet, TemplateIndicator, TickerMapping, add_screening_column(), add_ticker_to_list(), clear_prices(), create_commission_plan(), create_drawing() (+37 more)

### Community 3 - "Backend Architecture"
Cohesion: 0.04
Nodes (69): CSV Ticker Format, FastAPI, FinanceLogic, Google Sheets Integration, Investing.com Scraper, main:app, pandas-ta-classic, ProcessPoolExecutor (+61 more)

### Community 4 - "Pydantic Schemas"
Cohesion: 0.06
Nodes (60): BaseModel, Alarm, AlarmBase, AlarmCreate, AlarmOut, ChartTemplate, ChartTemplateBase, ChartTemplateCreate (+52 more)

### Community 5 - "UI Views & Components"
Cohesion: 0.06
Nodes (37): Alarm Configuration Modal, Drawing-based Alarm System, Alarms View, Technical Chart Component, Commission Fee Plans, Configuration View, CSV Import/Export for Lists, Drawing Annotation Toolbar (+29 more)

### Community 6 - "Feature Documentation"
Cohesion: 0.11
Nodes (33): Appunti Stocks Screener, Automatic Historical FX Rate Feature, Chart Monitoring View, Drawing Canvas Overlay, Dynamic Multi-Sheet Screening, Fallback Chain Strategy Rationale, FastAPI Backend Framework, _calculate_worker() (+25 more)

### Community 7 - "System Architecture"
Cohesion: 0.08
Nodes (28): Price Level Alarm Check System, CORS Middleware for Local Dev, SQLite Database Schema 12 Tables, On-Chart Drawing Tools System, FastAPI Backend Framework, FinanceLogic Singleton Business Logic, Incremental yfinance Data Sync, Investing.com Selenium Scraper (+20 more)

### Community 8 - "Drawing Canvas Tools"
Cohesion: 0.3
Nodes (25): applyStroke(), dot(), drawArrow(), drawBrush(), drawCallout(), drawCircle(), drawExtendedLine(), drawFibExtension() (+17 more)

### Community 9 - "Investing.com Scraper"
Cohesion: 0.11
Nodes (20): download_investing_csv(), get_chrome_user_data_dir(), parse_investing_csv_file(), Investing.com Portfolio Scraper Uses Selenium with the user's existing Chrome p, Returns the path to Chrome's user data directory., Scrape portfolio data from Investing.com using the user's Chrome profile., Automates the download of the Investing.com portfolio CSV using Edge., Parses an Investing.com portfolio CSV file, skipping the category header row. (+12 more)

### Community 10 - "Chart & Drawing Views"
Cohesion: 0.12
Nodes (19): Chart Canvas Drawing Layer, Drawing Tools, Indicator Templates, Monitoring/Chart View, Portfolio View, Sidebar Navigation, SPA Architecture, HTML Alarm Configuration Modal (+11 more)

### Community 11 - "CSV Ticker Parsing"
Cohesion: 0.67
Nodes (2): parse_csv_tickers(), Parses a CSV string with semicolon separator to extract tickers.     Format: ya

### Community 12 - "Caching Performance Tests"
Cohesion: 1.0
Nodes (2): call_api(), test_performance()

### Community 13 - "Sub-Universe Tests"
Cohesion: 1.0
Nodes (2): call_api(), test_subuniverse()

### Community 14 - "Portfolio Tests"
Cohesion: 1.0
Nodes (0): 

### Community 15 - "Community 15"
Cohesion: 1.0
Nodes (0): 

### Community 16 - "Community 16"
Cohesion: 1.0
Nodes (0): 

### Community 17 - "Community 17"
Cohesion: 1.0
Nodes (0): 

### Community 18 - "Community 18"
Cohesion: 1.0
Nodes (1): VACUUM

### Community 19 - "Community 19"
Cohesion: 1.0
Nodes (0): 

### Community 20 - "Community 20"
Cohesion: 1.0
Nodes (0): 

### Community 21 - "Community 21"
Cohesion: 1.0
Nodes (0): 

### Community 22 - "Community 22"
Cohesion: 1.0
Nodes (0): 

### Community 23 - "Community 23"
Cohesion: 1.0
Nodes (0): 

### Community 24 - "Community 24"
Cohesion: 1.0
Nodes (0): 

### Community 25 - "Community 25"
Cohesion: 1.0
Nodes (0): 

### Community 26 - "Community 26"
Cohesion: 1.0
Nodes (0): 

### Community 27 - "Community 27"
Cohesion: 1.0
Nodes (0): 

### Community 28 - "Community 28"
Cohesion: 1.0
Nodes (0): 

### Community 29 - "Community 29"
Cohesion: 1.0
Nodes (0): 

### Community 30 - "Community 30"
Cohesion: 1.0
Nodes (0): 

### Community 31 - "Community 31"
Cohesion: 1.0
Nodes (1): pandas Data Processing

### Community 32 - "Community 32"
Cohesion: 1.0
Nodes (0): 

### Community 33 - "Community 33"
Cohesion: 1.0
Nodes (0): 

### Community 34 - "Community 34"
Cohesion: 1.0
Nodes (1): finance_app.db

### Community 35 - "Community 35"
Cohesion: 1.0
Nodes (1): Screening View

### Community 36 - "Community 36"
Cohesion: 1.0
Nodes (1): Frontend Global State

## Knowledge Gaps
- **94 isolated node(s):** `Parses a CSV string with semicolon separator to extract tickers.     Format: ya`, `Investing.com Portfolio Scraper Uses Selenium with the user's existing Chrome p`, `Returns the path to Chrome's user data directory.`, `Scrape portfolio data from Investing.com using the user's Chrome profile.`, `Automates the download of the Investing.com portfolio CSV using Edge.` (+89 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Portfolio Tests`** (2 nodes): `test_portfolio.py`, `run_tests()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 15`** (2 nodes): `test_edge.py`, `test()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 16`** (2 nodes): `get_line_col()`, `scratch_check_divs.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 17`** (2 nodes): `get_line_col()`, `scratch_check_divs_complete.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 18`** (2 nodes): `raw_connection()`, `VACUUM`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 19`** (1 nodes): `scratch_print_view_parents_bs4.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 20`** (1 nodes): `scratch_count_divs.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 21`** (1 nodes): `scratch_list_views.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 22`** (1 nodes): `scratch_find_tag_matches.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 23`** (1 nodes): `debug_pyticker.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 24`** (1 nodes): `scratch_check.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 25`** (1 nodes): `scratch_find_malformed_tags.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (1 nodes): `scratch_find_mismatch.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (1 nodes): `scratch_fetch_served_html.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (1 nodes): `test_api.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (1 nodes): `scratch_count_divs_all.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 30`** (1 nodes): `scratch_find_all_unclosed.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 31`** (1 nodes): `pandas Data Processing`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 32`** (1 nodes): `check_yf_keys.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 33`** (1 nodes): `check_all_yf_keys.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 34`** (1 nodes): `finance_app.db`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 35`** (1 nodes): `Screening View`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 36`** (1 nodes): `Frontend Global State`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SQLAlchemy ORM` connect `Feature Documentation` to `Database Models & Alarms`, `Screening & Ticker Sources`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **Why does `FinanceLogic` connect `Database Models & Alarms` to `Screening & Ticker Sources`, `Feature Documentation`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **Are the 46 inferred relationships involving `ScreeningColumn` (e.g. with `verify_caching()` and `add_screening_column()`) actually correct?**
  _`ScreeningColumn` has 46 INFERRED edges - model-reasoned connections that need verification._
- **Are the 46 inferred relationships involving `Drawing` (e.g. with `sync_drawings()` and `create_drawing()`) actually correct?**
  _`Drawing` has 46 INFERRED edges - model-reasoned connections that need verification._
- **Are the 45 inferred relationships involving `ScreeningValue` (e.g. with `FinanceLogic` and `.run_dynamic_screening()`) actually correct?**
  _`ScreeningValue` has 45 INFERRED edges - model-reasoned connections that need verification._
- **Are the 45 inferred relationships involving `Alarm` (e.g. with `set_alarm()` and `FinanceLogic`) actually correct?**
  _`Alarm` has 45 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Parses a CSV string with semicolon separator to extract tickers.     Format: ya`, `Investing.com Portfolio Scraper Uses Selenium with the user's existing Chrome p`, `Returns the path to Chrome's user data directory.` to the rest of the system?**
  _94 weakly-connected nodes found - possible documentation gaps or missing edges._