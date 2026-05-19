# Graph Report - .  (2026-05-19)

## Corpus Check
- Corpus is ~48,274 words - fits in a single context window. You may not need a graph.

## Summary
- 457 nodes · 1037 edges · 35 communities detected
- Extraction: 77% EXTRACTED · 23% INFERRED · 0% AMBIGUOUS · INFERRED: 240 edges (avg confidence: 0.58)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Core Data Models|Core Data Models]]
- [[_COMMUNITY_Screening & Ticker Management|Screening & Ticker Management]]
- [[_COMMUNITY_Pydantic API Schemas|Pydantic API Schemas]]
- [[_COMMUNITY_Table CRUD Operations|Table CRUD Operations]]
- [[_COMMUNITY_API & UI Interaction|API & UI Interaction]]
- [[_COMMUNITY_System Architecture Overview|System Architecture Overview]]
- [[_COMMUNITY_Drawing & Annotation Tools|Drawing & Annotation Tools]]
- [[_COMMUNITY_Indicator Management|Indicator Management]]
- [[_COMMUNITY_Screening Sheet UI|Screening Sheet UI]]
- [[_COMMUNITY_Investing.com Scraper|Investing.com Scraper]]
- [[_COMMUNITY_Drawing Canvas|Drawing Canvas]]
- [[_COMMUNITY_Chart Initialization|Chart Initialization]]
- [[_COMMUNITY_CSV Portfolio Loading|CSV Portfolio Loading]]
- [[_COMMUNITY_Fundamental Screening|Fundamental Screening]]
- [[_COMMUNITY_CSV Ticker Parsing|CSV Ticker Parsing]]
- [[_COMMUNITY_API Performance Tests|API Performance Tests]]
- [[_COMMUNITY_Subuniverse Tests|Subuniverse Tests]]
- [[_COMMUNITY_Finance Logic Core|Finance Logic Core]]
- [[_COMMUNITY_Portfolio Tests|Portfolio Tests]]
- [[_COMMUNITY_Edge Case Tests|Edge Case Tests]]
- [[_COMMUNITY_Scratch Div Analysis|Scratch Div Analysis]]
- [[_COMMUNITY_Scratch Div Complete|Scratch Div Complete]]
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

## God Nodes (most connected - your core abstractions)
1. `apiCall()` - 48 edges
2. `FinanceLogic` - 35 edges
3. `ScreeningColumn` - 26 edges
4. `Drawing` - 26 edges
5. `ScreeningValue` - 25 edges
6. `Alarm` - 25 edges
7. `FundamentalData` - 25 edges
8. `Portfolio` - 25 edges
9. `Transaction` - 25 edges
10. `PriceData` - 24 edges

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
- **Technology Stack** — appunti_stocks_screener_FastAPI, appunti_stocks_screener_Uvicorn, appunti_stocks_screener_SQLite, appunti_stocks_screener_SQLAlchemy, appunti_stocks_screener_yfinance, appunti_stocks_screener_pandas_ta_classic, appunti_stocks_screener_Selenium, appunti_stocks_screener_gspread, appunti_stocks_screener_LightweightCharts [EXTRACTED 1.00]
- **Screening Pipeline** — appunti_stocks_screener_ScreeningSystem, appunti_stocks_screener_FinanceLogic, appunti_stocks_screener_ProcessPoolExecutor, appunti_stocks_screener_ScreeningCache, appunti_stocks_screener_DatabaseSchema [EXTRACTED 1.00]
- **Chart Drawing and Alarm System** — appunti_stocks_screener_LightweightCharts, appunti_stocks_screener_DrawingSystem, appunti_stocks_screener_AlarmSystem, index_html_DrawingToolbar [EXTRACTED 1.00]

## Communities

### Community 0 - "Core Data Models"
Cohesion: 0.11
Nodes (47): Base, Alarm, ChartTemplate, CommissionPlan, Drawing, FundamentalData, init_db(), Portfolio (+39 more)

### Community 1 - "Screening & Ticker Management"
Cohesion: 0.03
Nodes (34): ScreeningSheet, TickerMapping, add_screening_column(), add_ticker_to_list(), clear_prices(), create_commission_plan(), create_drawing(), create_list() (+26 more)

### Community 2 - "Pydantic API Schemas"
Cohesion: 0.06
Nodes (58): BaseModel, Alarm, AlarmBase, AlarmCreate, AlarmOut, ChartTemplate, ChartTemplateBase, ChartTemplateCreate (+50 more)

### Community 3 - "Table CRUD Operations"
Cohesion: 0.07
Nodes (28): addColumnToSheet(), addIndicator(), applyMappingFilters(), buildModalParamsSection(), checkAndNotifyAlarms(), deleteCommissionPlan(), deletePortfolio(), deleteTransaction() (+20 more)

### Community 4 - "API & UI Interaction"
Cohesion: 0.11
Nodes (28): addManualMapping(), apiCall(), clearAllPrices(), closeAlarmModal(), deleteAlarmFromList(), deleteInvestingUrl(), deleteSelectedOrphans(), deleteSingleOrphan() (+20 more)

### Community 5 - "System Architecture Overview"
Cohesion: 0.08
Nodes (28): Price Level Alarm Check System, CORS Middleware for Local Dev, SQLite Database Schema 12 Tables, On-Chart Drawing Tools System, FastAPI Backend Framework, FinanceLogic Singleton Business Logic, Incremental yfinance Data Sync, Investing.com Selenium Scraper (+20 more)

### Community 6 - "Drawing & Annotation Tools"
Cohesion: 0.3
Nodes (25): applyStroke(), dot(), drawArrow(), drawBrush(), drawCallout(), drawCircle(), drawExtendedLine(), drawFibExtension() (+17 more)

### Community 7 - "Indicator Management"
Cohesion: 0.14
Nodes (19): applyIndicators(), applyTemplate(), clearAllIndicators(), deduplicateData(), goToAlarmTicker(), goToTicker(), handleNoData(), removeIndicator() (+11 more)

### Community 8 - "Screening Sheet UI"
Cohesion: 0.16
Nodes (19): applyFundamentalSortAndFilter(), clearSubUniverse(), closeIndicatorModal(), confirmIndicatorModal(), createNewScreeningSheet(), deleteActiveScreeningSheet(), loadScreeningSheets(), readModalParams() (+11 more)

### Community 9 - "Investing.com Scraper"
Cohesion: 0.14
Nodes (17): download_investing_csv(), get_chrome_user_data_dir(), parse_investing_csv_file(), Investing.com Portfolio Scraper Uses Selenium with the user's existing Chrome p, Returns the path to Chrome's user data directory., Scrape portfolio data from Investing.com using the user's Chrome profile., Automates the download of the Investing.com portfolio CSV using Edge., Parses an Investing.com portfolio CSV file, skipping the category header row. (+9 more)

### Community 10 - "Drawing Canvas"
Cohesion: 0.18
Nodes (12): deleteDrawing(), initDrawingCanvas(), initDrawingTools(), loadDrawings(), redrawAllDrawings(), resizeAllCharts(), resizeDrawingCanvas(), setDrawingTool() (+4 more)

### Community 11 - "Chart Initialization"
Cohesion: 0.25
Nodes (11): createBaseChart(), deleteTemplate(), getOrCreatePane(), initApp(), initChart(), loadTemplates(), migrateDrawingsToBackend(), normalizeChart() (+3 more)

### Community 12 - "CSV Portfolio Loading"
Cohesion: 0.32
Nodes (8): loadInvestingCSV(), loadInvestingPortfolio(), loadLocalInvestingCSV(), renderCSVBody(), renderInvestingCSVTable(), renderInvestingTable(), setInvestingTabActive(), updateInvestingCSVTabs()

### Community 13 - "Fundamental Screening"
Cohesion: 0.29
Nodes (7): formatLargeNumber(), loadFundamentalData(), renderFundamentalScreening(), runFundamentalScreening(), setupFundamentalFilters(), setupFundamentalSortListeners(), updateFundamentalsManually()

### Community 14 - "CSV Ticker Parsing"
Cohesion: 0.67
Nodes (2): parse_csv_tickers(), Parses a CSV string with semicolon separator to extract tickers.     Format: ya

### Community 15 - "API Performance Tests"
Cohesion: 1.0
Nodes (2): call_api(), test_performance()

### Community 16 - "Subuniverse Tests"
Cohesion: 1.0
Nodes (2): call_api(), test_subuniverse()

### Community 17 - "Finance Logic Core"
Cohesion: 1.0
Nodes (2): _calculate_worker(), _resample_df()

### Community 18 - "Portfolio Tests"
Cohesion: 1.0
Nodes (0): 

### Community 19 - "Edge Case Tests"
Cohesion: 1.0
Nodes (0): 

### Community 20 - "Scratch Div Analysis"
Cohesion: 1.0
Nodes (0): 

### Community 21 - "Scratch Div Complete"
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
Nodes (0): 

### Community 32 - "Community 32"
Cohesion: 1.0
Nodes (0): 

### Community 33 - "Community 33"
Cohesion: 1.0
Nodes (0): 

### Community 34 - "Community 34"
Cohesion: 1.0
Nodes (1): pandas Data Processing

## Knowledge Gaps
- **30 isolated node(s):** `Parses a CSV string with semicolon separator to extract tickers.     Format: ya`, `Investing.com Portfolio Scraper Uses Selenium with the user's existing Chrome p`, `Returns the path to Chrome's user data directory.`, `Scrape portfolio data from Investing.com using the user's Chrome profile.`, `Automates the download of the Investing.com portfolio CSV using Edge.` (+25 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Portfolio Tests`** (2 nodes): `test_portfolio.py`, `run_tests()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Edge Case Tests`** (2 nodes): `test_edge.py`, `test()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Scratch Div Analysis`** (2 nodes): `get_line_col()`, `scratch_check_divs.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Scratch Div Complete`** (2 nodes): `get_line_col()`, `scratch_check_divs_complete.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 22`** (1 nodes): `scratch_print_view_parents_bs4.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 23`** (1 nodes): `scratch_count_divs.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 24`** (1 nodes): `scratch_list_views.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 25`** (1 nodes): `scratch_find_tag_matches.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (1 nodes): `debug_pyticker.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (1 nodes): `scratch_check.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (1 nodes): `scratch_find_malformed_tags.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (1 nodes): `scratch_find_mismatch.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 30`** (1 nodes): `scratch_fetch_served_html.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 31`** (1 nodes): `test_api.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 32`** (1 nodes): `scratch_count_divs_all.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 33`** (1 nodes): `scratch_find_all_unclosed.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 34`** (1 nodes): `pandas Data Processing`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `FinanceLogic` connect `Core Data Models` to `Finance Logic Core`, `Screening & Ticker Management`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Why does `Drawing` connect `Core Data Models` to `Screening & Ticker Management`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **Why does `get_investing_portfolio_csv()` connect `Investing.com Scraper` to `Screening & Ticker Management`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **Are the 10 inferred relationships involving `FinanceLogic` (e.g. with `PriceData` and `ScreeningValue`) actually correct?**
  _`FinanceLogic` has 10 INFERRED edges - model-reasoned connections that need verification._
- **Are the 24 inferred relationships involving `ScreeningColumn` (e.g. with `FinanceLogic` and `Downloads data from yfinance and saves to DB. Incremental approach if data exist`) actually correct?**
  _`ScreeningColumn` has 24 INFERRED edges - model-reasoned connections that need verification._
- **Are the 24 inferred relationships involving `Drawing` (e.g. with `FinanceLogic` and `Downloads data from yfinance and saves to DB. Incremental approach if data exist`) actually correct?**
  _`Drawing` has 24 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Parses a CSV string with semicolon separator to extract tickers.     Format: ya`, `Investing.com Portfolio Scraper Uses Selenium with the user's existing Chrome p`, `Returns the path to Chrome's user data directory.` to the rest of the system?**
  _30 weakly-connected nodes found - possible documentation gaps or missing edges._