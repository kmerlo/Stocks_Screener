# Graph Report - .  (2026-06-01)

## Corpus Check
- 41 files · ~101,309 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 576 nodes · 1406 edges · 38 communities detected
- Extraction: 67% EXTRACTED · 33% INFERRED · 0% AMBIGUOUS · INFERRED: 462 edges (avg confidence: 0.56)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Database Models & Domain Entities|Database Models & Domain Entities]]
- [[_COMMUNITY_Database Schema & Screening Management|Database Schema & Screening Management]]
- [[_COMMUNITY_Pydantic API Schemas|Pydantic API Schemas]]
- [[_COMMUNITY_Frontend Controller Functions|Frontend Controller Functions]]
- [[_COMMUNITY_UI Views & Alarm System|UI Views & Alarm System]]
- [[_COMMUNITY_App Architecture & Design Rationale|App Architecture & Design Rationale]]
- [[_COMMUNITY_Frontend API & Data Operations|Frontend API & Data Operations]]
- [[_COMMUNITY_Backend System Architecture|Backend System Architecture]]
- [[_COMMUNITY_Drawing Canvas Rendering|Drawing Canvas Rendering]]
- [[_COMMUNITY_Investing.com Scraper|Investing.com Scraper]]
- [[_COMMUNITY_Chart Indicator Management|Chart Indicator Management]]
- [[_COMMUNITY_Screening UI Operations|Screening UI Operations]]
- [[_COMMUNITY_Drawing Canvas Initialization|Drawing Canvas Initialization]]
- [[_COMMUNITY_Chart Initialization & Templates|Chart Initialization & Templates]]
- [[_COMMUNITY_Fundamental Data Rendering|Fundamental Data Rendering]]
- [[_COMMUNITY_Investing.com Portfolio View|Investing.com Portfolio View]]
- [[_COMMUNITY_CSV Ticker Parsing|CSV Ticker Parsing]]
- [[_COMMUNITY_Caching Performance Tests|Caching Performance Tests]]
- [[_COMMUNITY_Subuniverse Tests|Subuniverse Tests]]
- [[_COMMUNITY_Portfolio Tests|Portfolio Tests]]
- [[_COMMUNITY_Edge Case Tests|Edge Case Tests]]
- [[_COMMUNITY_HTML Div Debug (check_divs)|HTML Div Debug (check_divs)]]
- [[_COMMUNITY_HTML Div Debug (check_divs_complete)|HTML Div Debug (check_divs_complete)]]
- [[_COMMUNITY_HTML View Debug|HTML View Debug]]
- [[_COMMUNITY_HTML Count Divs|HTML Count Divs]]
- [[_COMMUNITY_HTML List Views|HTML List Views]]
- [[_COMMUNITY_HTML Tag Matching|HTML Tag Matching]]
- [[_COMMUNITY_Debug Pyticker|Debug Pyticker]]
- [[_COMMUNITY_Scratch Check|Scratch Check]]
- [[_COMMUNITY_Malformed Tag Debug|Malformed Tag Debug]]
- [[_COMMUNITY_HTML Mismatch Debug|HTML Mismatch Debug]]
- [[_COMMUNITY_HTML Fetch Debug|HTML Fetch Debug]]
- [[_COMMUNITY_API Tests|API Tests]]
- [[_COMMUNITY_HTML Count Divs All|HTML Count Divs All]]
- [[_COMMUNITY_HTML Unclosed Tags|HTML Unclosed Tags]]
- [[_COMMUNITY_Pandas Data Processing|Pandas Data Processing]]
- [[_COMMUNITY_YFinance Key Check|YFinance Key Check]]
- [[_COMMUNITY_YFinance All Keys Check|YFinance All Keys Check]]

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
- `add_screening_column()` --calls--> `ScreeningColumn`  [INFERRED]
  main.py → database.py
- `create_drawing()` --calls--> `Drawing`  [INFERRED]
  main.py → database.py
- `create_portfolio()` --calls--> `Portfolio`  [INFERRED]
  main.py → database.py
- `create_transaction()` --calls--> `Transaction`  [INFERRED]
  main.py → database.py
- `yfinance Yahoo Finance Provider` --semantically_similar_to--> `pytickersymbols Stock Index Data`  [INFERRED] [semantically similar]
  Appunti_Stocks_Screener.md → requirements.txt

## Hyperedges (group relationships)
- **Screening Workflow** — index_html_screening_base_sheet, index_html_screening_roc_sheet, index_html_screening_fundamental_sheet, index_html_screening_custom_sheet [INFERRED 0.90]
- **Portfolio Lifecycle** — index_html_portfolio_positions, index_html_portfolio_transactions, index_html_portfolio_cash, index_html_commission_plans [INFERRED 0.90]
- **Data Integration Layer** — index_html_gsheet_view, index_html_investing_view, index_html_ticker_mappings, index_html_csv_import_export [INFERRED 0.80]

## Communities

### Community 0 - "Database Models & Domain Entities"
Cohesion: 0.12
Nodes (66): Base, Alarm, ChartTemplate, CommissionPlan, Drawing, FundamentalData, HistoricalFundamentalData, Portfolio (+58 more)

### Community 1 - "Database Schema & Screening Management"
Cohesion: 0.02
Nodes (44): init_db(), ScreeningSheet, TemplateIndicator, TickerList, TickerMapping, add_screening_column(), clear_prices(), create_commission_plan() (+36 more)

### Community 2 - "Pydantic API Schemas"
Cohesion: 0.06
Nodes (60): BaseModel, Alarm, AlarmBase, AlarmCreate, AlarmOut, ChartTemplate, ChartTemplateBase, ChartTemplateCreate (+52 more)

### Community 3 - "Frontend Controller Functions"
Cohesion: 0.06
Nodes (30): addColumnToSheet(), addIndicator(), applyMappingFilters(), buildModalParamsSection(), checkAndNotifyAlarms(), deleteCommissionPlan(), deletePortfolio(), deleteTransaction() (+22 more)

### Community 4 - "UI Views & Alarm System"
Cohesion: 0.06
Nodes (37): Alarm Configuration Modal, Drawing-based Alarm System, Alarms View, Technical Chart Component, Commission Fee Plans, Configuration View, CSV Import/Export for Lists, Drawing Annotation Toolbar (+29 more)

### Community 5 - "App Architecture & Design Rationale"
Cohesion: 0.11
Nodes (33): Appunti Stocks Screener, Automatic Historical FX Rate Feature, Chart Monitoring View, Drawing Canvas Overlay, Dynamic Multi-Sheet Screening, Fallback Chain Strategy Rationale, FastAPI Backend Framework, _calculate_worker() (+25 more)

### Community 6 - "Frontend API & Data Operations"
Cohesion: 0.11
Nodes (28): addManualMapping(), apiCall(), clearAllPrices(), closeAlarmModal(), deleteAlarmFromList(), deleteInvestingUrl(), deleteSelectedOrphans(), deleteSingleOrphan() (+20 more)

### Community 7 - "Backend System Architecture"
Cohesion: 0.08
Nodes (28): Price Level Alarm Check System, CORS Middleware for Local Dev, SQLite Database Schema 12 Tables, On-Chart Drawing Tools System, FastAPI Backend Framework, FinanceLogic Singleton Business Logic, Incremental yfinance Data Sync, Investing.com Selenium Scraper (+20 more)

### Community 8 - "Drawing Canvas Rendering"
Cohesion: 0.3
Nodes (25): applyStroke(), dot(), drawArrow(), drawBrush(), drawCallout(), drawCircle(), drawExtendedLine(), drawFibExtension() (+17 more)

### Community 9 - "Investing.com Scraper"
Cohesion: 0.11
Nodes (20): download_investing_csv(), get_chrome_user_data_dir(), parse_investing_csv_file(), Investing.com Portfolio Scraper Uses Selenium with the user's existing Chrome p, Returns the path to Chrome's user data directory., Scrape portfolio data from Investing.com using the user's Chrome profile., Automates the download of the Investing.com portfolio CSV using Edge., Parses an Investing.com portfolio CSV file, skipping the category header row. (+12 more)

### Community 10 - "Chart Indicator Management"
Cohesion: 0.14
Nodes (19): applyIndicators(), applyTemplate(), clearAllIndicators(), deduplicateData(), goToAlarmTicker(), goToTicker(), handleNoData(), removeIndicator() (+11 more)

### Community 11 - "Screening UI Operations"
Cohesion: 0.16
Nodes (19): applyFundamentalSortAndFilter(), clearSubUniverse(), closeIndicatorModal(), confirmIndicatorModal(), createNewScreeningSheet(), deleteActiveScreeningSheet(), loadScreeningSheets(), readModalParams() (+11 more)

### Community 12 - "Drawing Canvas Initialization"
Cohesion: 0.18
Nodes (12): deleteDrawing(), initDrawingCanvas(), initDrawingTools(), loadDrawings(), redrawAllDrawings(), resizeAllCharts(), resizeDrawingCanvas(), setDrawingTool() (+4 more)

### Community 13 - "Chart Initialization & Templates"
Cohesion: 0.23
Nodes (12): createBaseChart(), deleteTemplate(), getOrCreatePane(), initApp(), initChart(), loadTemplates(), migrateDrawingsToBackend(), normalizeChart() (+4 more)

### Community 14 - "Fundamental Data Rendering"
Cohesion: 0.25
Nodes (9): formatLargeNumber(), loadFundamentalData(), loadHistoricalFundamentals(), renderFundamentalScreening(), renderKeyStatisticsDashboard(), runFundamentalScreening(), setupFundamentalFilters(), setupFundamentalSortListeners() (+1 more)

### Community 15 - "Investing.com Portfolio View"
Cohesion: 0.32
Nodes (8): loadInvestingCSV(), loadInvestingPortfolio(), loadLocalInvestingCSV(), renderCSVBody(), renderInvestingCSVTable(), renderInvestingTable(), setInvestingTabActive(), updateInvestingCSVTabs()

### Community 16 - "CSV Ticker Parsing"
Cohesion: 0.67
Nodes (2): parse_csv_tickers(), Parses a CSV string with semicolon separator to extract tickers.     Format: ya

### Community 17 - "Caching Performance Tests"
Cohesion: 1.0
Nodes (2): call_api(), test_performance()

### Community 18 - "Subuniverse Tests"
Cohesion: 1.0
Nodes (2): call_api(), test_subuniverse()

### Community 19 - "Portfolio Tests"
Cohesion: 1.0
Nodes (0): 

### Community 20 - "Edge Case Tests"
Cohesion: 1.0
Nodes (0): 

### Community 21 - "HTML Div Debug (check_divs)"
Cohesion: 1.0
Nodes (0): 

### Community 22 - "HTML Div Debug (check_divs_complete)"
Cohesion: 1.0
Nodes (0): 

### Community 23 - "HTML View Debug"
Cohesion: 1.0
Nodes (0): 

### Community 24 - "HTML Count Divs"
Cohesion: 1.0
Nodes (0): 

### Community 25 - "HTML List Views"
Cohesion: 1.0
Nodes (0): 

### Community 26 - "HTML Tag Matching"
Cohesion: 1.0
Nodes (0): 

### Community 27 - "Debug Pyticker"
Cohesion: 1.0
Nodes (0): 

### Community 28 - "Scratch Check"
Cohesion: 1.0
Nodes (0): 

### Community 29 - "Malformed Tag Debug"
Cohesion: 1.0
Nodes (0): 

### Community 30 - "HTML Mismatch Debug"
Cohesion: 1.0
Nodes (0): 

### Community 31 - "HTML Fetch Debug"
Cohesion: 1.0
Nodes (0): 

### Community 32 - "API Tests"
Cohesion: 1.0
Nodes (0): 

### Community 33 - "HTML Count Divs All"
Cohesion: 1.0
Nodes (0): 

### Community 34 - "HTML Unclosed Tags"
Cohesion: 1.0
Nodes (0): 

### Community 35 - "Pandas Data Processing"
Cohesion: 1.0
Nodes (1): pandas Data Processing

### Community 36 - "YFinance Key Check"
Cohesion: 1.0
Nodes (0): 

### Community 37 - "YFinance All Keys Check"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **59 isolated node(s):** `Parses a CSV string with semicolon separator to extract tickers.     Format: ya`, `Investing.com Portfolio Scraper Uses Selenium with the user's existing Chrome p`, `Returns the path to Chrome's user data directory.`, `Scrape portfolio data from Investing.com using the user's Chrome profile.`, `Automates the download of the Investing.com portfolio CSV using Edge.` (+54 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Portfolio Tests`** (2 nodes): `test_portfolio.py`, `run_tests()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Edge Case Tests`** (2 nodes): `test_edge.py`, `test()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `HTML Div Debug (check_divs)`** (2 nodes): `get_line_col()`, `scratch_check_divs.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `HTML Div Debug (check_divs_complete)`** (2 nodes): `get_line_col()`, `scratch_check_divs_complete.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `HTML View Debug`** (1 nodes): `scratch_print_view_parents_bs4.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `HTML Count Divs`** (1 nodes): `scratch_count_divs.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `HTML List Views`** (1 nodes): `scratch_list_views.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `HTML Tag Matching`** (1 nodes): `scratch_find_tag_matches.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Debug Pyticker`** (1 nodes): `debug_pyticker.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Scratch Check`** (1 nodes): `scratch_check.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Malformed Tag Debug`** (1 nodes): `scratch_find_malformed_tags.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `HTML Mismatch Debug`** (1 nodes): `scratch_find_mismatch.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `HTML Fetch Debug`** (1 nodes): `scratch_fetch_served_html.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `API Tests`** (1 nodes): `test_api.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `HTML Count Divs All`** (1 nodes): `scratch_count_divs_all.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `HTML Unclosed Tags`** (1 nodes): `scratch_find_all_unclosed.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Pandas Data Processing`** (1 nodes): `pandas Data Processing`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `YFinance Key Check`** (1 nodes): `check_yf_keys.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `YFinance All Keys Check`** (1 nodes): `check_all_yf_keys.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SQLAlchemy ORM` connect `App Architecture & Design Rationale` to `Database Models & Domain Entities`, `Database Schema & Screening Management`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **Why does `FinanceLogic` connect `Database Models & Domain Entities` to `Database Schema & Screening Management`, `App Architecture & Design Rationale`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Are the 46 inferred relationships involving `ScreeningColumn` (e.g. with `verify_caching()` and `add_screening_column()`) actually correct?**
  _`ScreeningColumn` has 46 INFERRED edges - model-reasoned connections that need verification._
- **Are the 46 inferred relationships involving `Drawing` (e.g. with `sync_drawings()` and `create_drawing()`) actually correct?**
  _`Drawing` has 46 INFERRED edges - model-reasoned connections that need verification._
- **Are the 45 inferred relationships involving `ScreeningValue` (e.g. with `FinanceLogic` and `.run_dynamic_screening()`) actually correct?**
  _`ScreeningValue` has 45 INFERRED edges - model-reasoned connections that need verification._
- **Are the 45 inferred relationships involving `Alarm` (e.g. with `set_alarm()` and `FinanceLogic`) actually correct?**
  _`Alarm` has 45 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Parses a CSV string with semicolon separator to extract tickers.     Format: ya`, `Investing.com Portfolio Scraper Uses Selenium with the user's existing Chrome p`, `Returns the path to Chrome's user data directory.` to the rest of the system?**
  _59 weakly-connected nodes found - possible documentation gaps or missing edges._