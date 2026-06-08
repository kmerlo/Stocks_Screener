# Graph Report - .  (2026-06-08)

## Corpus Check
- 45 files · ~128,365 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 715 nodes · 1563 edges · 52 communities detected
- Extraction: 76% EXTRACTED · 24% INFERRED · 0% AMBIGUOUS · INFERRED: 380 edges (avg confidence: 0.57)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_ScreeningDB Core|Screening/DB Core]]
- [[_COMMUNITY_Config Database Models|Config Database Models]]
- [[_COMMUNITY_Pydantic API Schemas|Pydantic API Schemas]]
- [[_COMMUNITY_System Documentation & Architecture|System Documentation & Architecture]]
- [[_COMMUNITY_Finance Logic & Analysis|Finance Logic & Analysis]]
- [[_COMMUNITY_Frontend Screener UI|Frontend Screener UI]]
- [[_COMMUNITY_Frontend API & Mappings|Frontend API & Mappings]]
- [[_COMMUNITY_Frontend Drawing Tools|Frontend Drawing Tools]]
- [[_COMMUNITY_Frontend Tax & Dividends|Frontend Tax & Dividends]]
- [[_COMMUNITY_Frontend Charts & Indicators|Frontend Charts & Indicators]]
- [[_COMMUNITY_Frontend Screening Sheets|Frontend Screening Sheets]]
- [[_COMMUNITY_Investing.com Scraper|Investing.com Scraper]]
- [[_COMMUNITY_Frontend Portfolio Management|Frontend Portfolio Management]]
- [[_COMMUNITY_Frontend Drawing Canvas|Frontend Drawing Canvas]]
- [[_COMMUNITY_Frontend Notifications & Refresh|Frontend Notifications & Refresh]]
- [[_COMMUNITY_Frontend Chart Init|Frontend Chart Init]]
- [[_COMMUNITY_Graphify Output|Graphify Output]]
- [[_COMMUNITY_Frontend Investing CSV|Frontend Investing CSV]]
- [[_COMMUNITY_DB Migration Script|DB Migration Script]]
- [[_COMMUNITY_FX Rate Implementation|FX Rate Implementation]]
- [[_COMMUNITY_CSV Ticker Parsing Test|CSV Ticker Parsing Test]]
- [[_COMMUNITY_Caching Performance Test|Caching Performance Test]]
- [[_COMMUNITY_Subuniverse Test|Subuniverse Test]]
- [[_COMMUNITY_FinanceLogic Internal|FinanceLogic Internal]]
- [[_COMMUNITY_Portfolio Test|Portfolio Test]]
- [[_COMMUNITY_Edge Case Test|Edge Case Test]]
- [[_COMMUNITY_Div Check Script|Div Check Script]]
- [[_COMMUNITY_Div Check Complete Script|Div Check Complete Script]]
- [[_COMMUNITY_Server Logs|Server Logs]]
- [[_COMMUNITY_Print View Parents Script|Print View Parents Script]]
- [[_COMMUNITY_Count Divs Script|Count Divs Script]]
- [[_COMMUNITY_List Views Script|List Views Script]]
- [[_COMMUNITY_Find Tag Matches Script|Find Tag Matches Script]]
- [[_COMMUNITY_Debug Pyticker Script|Debug Pyticker Script]]
- [[_COMMUNITY_Check Script|Check Script]]
- [[_COMMUNITY_Malformed Tags Script|Malformed Tags Script]]
- [[_COMMUNITY_Mismatch Script|Mismatch Script]]
- [[_COMMUNITY_Fetch Served HTML Script|Fetch Served HTML Script]]
- [[_COMMUNITY_API Test Script|API Test Script]]
- [[_COMMUNITY_Count Divs All Script|Count Divs All Script]]
- [[_COMMUNITY_Find All Unclosed Script|Find All Unclosed Script]]
- [[_COMMUNITY_Check YF Keys|Check YF Keys]]
- [[_COMMUNITY_Check All YF Keys|Check All YF Keys]]
- [[_COMMUNITY_Pandas Dependency|Pandas Dependency]]
- [[_COMMUNITY_Scipy Dependency|Scipy Dependency]]
- [[_COMMUNITY_Pytickersymbols Dependency|Pytickersymbols Dependency]]
- [[_COMMUNITY_Git Remote Config|Git Remote Config]]
- [[_COMMUNITY_Appunti Portfolio View|Appunti Portfolio View]]
- [[_COMMUNITY_Appunti Screening View|Appunti Screening View]]
- [[_COMMUNITY_Appunti Frontend State|Appunti Frontend State]]
- [[_COMMUNITY_Test Strategy Transaction|Test Strategy Transaction]]
- [[_COMMUNITY_Test Strategy HTTP API|Test Strategy HTTP API]]

## God Nodes (most connected - your core abstractions)
1. `apiCall()` - 49 edges
2. `FinanceLogic` - 41 edges
3. `Broker` - 29 edges
4. `ScreeningColumn` - 28 edges
5. `Drawing` - 28 edges
6. `FiscalBackpackEntry` - 28 edges
7. `Alarm` - 27 edges
8. `Portfolio` - 27 edges
9. `TaxPlan` - 27 edges
10. `Transaction` - 27 edges

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
- **Frontend Core Stack** — appuntistocksscreener_lightweight_charts, appuntistocksscreener_spa_architecture, appuntistocksscreener_sidebar_nav, appuntistocksscreener_global_state [EXTRACTED 1.00]
- **Data Sources** — agantsmd_yfinance, appuntistocksscreener_pytickersymbols, appuntistocksscreener_selenium, appuntistocksscreener_lightweight_charts, appuntistocksscreener_gspread [EXTRACTED 1.00]
- **Portfolio Management System** — appuntistocksscreener_portfolio_view, indexhtml_transaction_modal, indexhtml_cash_modal, indexhtml_commission_plans_modal, appuntistocksscreener_flow_portfolio, appuntistocksscreener_get_portfolio_summary [EXTRACTED 1.00]
- **Screening System** — appuntistocksscreener_screenaing_view, appuntistocksscreener_screenaing_cache, appuntistocksscreener_run_modular_screening, appuntistocksscreener_run_dynamic_screening, agantsmd_screenaingsheet, agantsmd_screenaingvalue, agantsmd_processpoolexecutor [EXTRACTED 1.00]
- **All API Groups Exposed by main.py** — appuntistocksscreener_main_py, appuntistocksscreener_api_ticker_lists, appuntistocksscreener_api_price_data, appuntistocksscreener_api_screenaing, appuntistocksscreener_api_indicators, appuntistocksscreener_api_drawings, appuntistocksscreener_api_alarms, appuntistocksscreener_api_fundamentals, appuntistocksscreener_api_ticker_mappings, appuntistocksscreener_api_portfolio, appuntistocksscreener_api_google_sheets, appuntistocksscreener_api_investing, appuntistocksscreener_api_maintenance [EXTRACTED 1.00]
- **Automatic FX Rate Workflow** — automatic_fx_rate_feature, fx_rate_endpoint, weekend_fallback_rationale, yfinance_data_source, fallback_chain_rationale [EXTRACTED 1.00]
- **Backend Infrastructure Stack** — agantsmd_fastapi_app, agantsmd_uvicorn, agantsmd_config_db, agantsmd_market_db, agantsmd_financelogic, agantsmd_yfinance, agantsmd_processpoolexecutor, agantsmd_screeningvalue, agantsmd_screeningsheet [EXTRACTED 1.00]
- **Frontend SPA Views System** — index_spa_application, index_sidebar_nav, index_monitoring_chart_view, index_portfolio_view, index_screening_view, index_historical_data_view, index_alarms_view, index_maintenance_view, index_google_sheet_view, index_investing_view, index_configuration_view [EXTRACTED 1.00]
- **Portfolio Management Modals** — index_portfolio_view, index_portfolio_management, index_transaction_modal, index_dividend_modal, index_coupon_modal, index_cash_modal, errore_portfolio_collapsible_bug [EXTRACTED 1.00]

## Communities

### Community 0 - "Screening/DB Core"
Cohesion: 0.02
Nodes (54): ScreeningSheet, TemplateIndicator, TickerMapping, add_screening_column(), add_ticker_to_list(), clear_prices(), _compute_dividend_cash_delta(), create_broker() (+46 more)

### Community 1 - "Config Database Models"
Cohesion: 0.11
Nodes (60): ConfigBase, Alarm, Broker, ChartTemplate, CommissionPlan, Drawing, _ensure_default_broker(), FiscalBackpackEntry (+52 more)

### Community 2 - "Pydantic API Schemas"
Cohesion: 0.05
Nodes (69): BaseModel, Alarm, AlarmBase, AlarmCreate, AlarmOut, Broker, BrokerBase, BrokerCreate (+61 more)

### Community 3 - "System Documentation & Architecture"
Cohesion: 0.04
Nodes (65): config.db (User Configuration), FastAPI Application, Google Sheets Integration, Investing.com Selenium Scraper, market.db (Market Data), ScreeningSheet Model, ScreeningValue Caching Table, Split Database Architecture (+57 more)

### Community 4 - "Finance Logic & Analysis"
Cohesion: 0.05
Nodes (58): FinanceLogic Class, pandas-ta-classic Library, ProcessPoolExecutor Parallel Screening, yfinance Data Source, Alarms API, Drawings API, Fundamental Data API, Google Sheets API (+50 more)

### Community 5 - "Frontend Screener UI"
Cohesion: 0.05
Nodes (26): addColumnToSheet(), addIndicator(), applyMappingFilters(), buildFundamentalHeaders(), buildModalParamsSection(), dismissContextMenu(), editScreeningColumn(), enrichFundamentalData() (+18 more)

### Community 6 - "Frontend API & Mappings"
Cohesion: 0.08
Nodes (38): addManualMapping(), apiCall(), clearAllPrices(), closeAlarmModal(), deleteAlarmFromList(), deleteInvestingUrl(), deleteSelectedOrphans(), deleteSingleOrphan() (+30 more)

### Community 7 - "Frontend Drawing Tools"
Cohesion: 0.25
Nodes (28): applyStroke(), dot(), drawArrow(), drawBrush(), drawCallout(), drawCircle(), drawExtendedLine(), drawFibExtension() (+20 more)

### Community 8 - "Frontend Tax & Dividends"
Cohesion: 0.13
Nodes (23): closePositionModal(), deleteTaxPlan(), getDividendGrossInstrument(), getDividendMode(), getDividendSignedShares(), loadAndRenderTaxPlans(), loadTaxPlanDropdowns(), loadTaxPlans() (+15 more)

### Community 9 - "Frontend Charts & Indicators"
Cohesion: 0.14
Nodes (22): activateChartSlot(), applyIndicators(), applyTemplate(), autoPopulateEmptySlots(), clearAllIndicators(), deduplicateData(), handleNoData(), removeIndicator() (+14 more)

### Community 10 - "Frontend Screening Sheets"
Cohesion: 0.16
Nodes (19): applyFundamentalSortAndFilter(), clearSubUniverse(), closeIndicatorModal(), confirmIndicatorModal(), createNewScreeningSheet(), deleteActiveScreeningSheet(), loadScreeningSheets(), readModalParams() (+11 more)

### Community 11 - "Investing.com Scraper"
Cohesion: 0.14
Nodes (17): download_investing_csv(), get_chrome_user_data_dir(), parse_investing_csv_file(), Investing.com Portfolio Scraper Uses Selenium with the user's existing Chrome p, Returns the path to Chrome's user data directory., Scrape portfolio data from Investing.com using the user's Chrome profile., Automates the download of the Investing.com portfolio CSV using Edge., Parses an Investing.com portfolio CSV file, skipping the category header row. (+9 more)

### Community 12 - "Frontend Portfolio Management"
Cohesion: 0.15
Nodes (17): _bpManageYears(), _bpPopulateBrokerDropdown(), _bpRenderYearInputs(), deleteBroker(), deleteCommissionPlan(), deletePortfolio(), initPortfolioView(), loadAndRenderBrokers() (+9 more)

### Community 13 - "Frontend Drawing Canvas"
Cohesion: 0.17
Nodes (13): buildDrawingHandlers(), deleteDrawing(), drawTransactionNoteDots(), initDrawingCanvas(), initDrawingTools(), loadDrawings(), reattachDrawingListeners(), redrawAllDrawings() (+5 more)

### Community 14 - "Frontend Notifications & Refresh"
Cohesion: 0.17
Nodes (13): autoRefreshAction(), checkAndNotifyAlarms(), deleteTransaction(), getListTickers(), loadTransactionsHistory(), playBeep(), refreshPortfolio(), renderPortfolioHistory() (+5 more)

### Community 15 - "Frontend Chart Init"
Cohesion: 0.25
Nodes (11): changeChartCount(), createBaseChart(), getOrCreatePane(), initApp(), initChart(), initChartSlots(), migrateDrawingsToBackend(), normalizeChart() (+3 more)

### Community 16 - "Graphify Output"
Cohesion: 0.24
Nodes (11): Dark Theme Graph UI, ForceAtlas2Based Physics Layout, Hyperedge Shaded Region Rendering, Community Legend with Toggle Visibility, Graph Node Search with Autocomplete, Sidebar Info Panel with Neighbors, Graph: 672 nodes, 1538 edges, 37 communities, vis-network Graph Visualization (+3 more)

### Community 17 - "Frontend Investing CSV"
Cohesion: 0.32
Nodes (8): loadInvestingCSV(), loadInvestingPortfolio(), loadLocalInvestingCSV(), renderCSVBody(), renderInvestingCSVTable(), renderInvestingTable(), setInvestingTabActive(), updateInvestingCSVTabs()

### Community 18 - "DB Migration Script"
Cohesion: 0.47
Nodes (5): copy_table_data(), get_tables_in_db(), main(), Get list of tables in a SQLite database., Copy all data from a table in src_conn to same table in dst_conn.

### Community 19 - "FX Rate Implementation"
Cohesion: 0.6
Nodes (5): Automatic Historical FX Rate Feature, Fallback Chain Strategy Rationale, GET /fx_rate API Endpoint, Implementation Plan - Automatic FX Rates, Weekend FX Closest-Day Fallback Rationale

### Community 20 - "CSV Ticker Parsing Test"
Cohesion: 0.67
Nodes (2): parse_csv_tickers(), Parses a CSV string with semicolon separator to extract tickers.     Format: ya

### Community 21 - "Caching Performance Test"
Cohesion: 1.0
Nodes (2): call_api(), test_performance()

### Community 22 - "Subuniverse Test"
Cohesion: 1.0
Nodes (2): call_api(), test_subuniverse()

### Community 23 - "FinanceLogic Internal"
Cohesion: 1.0
Nodes (2): _calculate_worker(), _resample_df()

### Community 24 - "Portfolio Test"
Cohesion: 1.0
Nodes (0): 

### Community 25 - "Edge Case Test"
Cohesion: 1.0
Nodes (0): 

### Community 26 - "Div Check Script"
Cohesion: 1.0
Nodes (0): 

### Community 27 - "Div Check Complete Script"
Cohesion: 1.0
Nodes (0): 

### Community 28 - "Server Logs"
Cohesion: 1.0
Nodes (2): Server Running on Port 8002, Uvicorn Server Log

### Community 29 - "Print View Parents Script"
Cohesion: 1.0
Nodes (0): 

### Community 30 - "Count Divs Script"
Cohesion: 1.0
Nodes (0): 

### Community 31 - "List Views Script"
Cohesion: 1.0
Nodes (0): 

### Community 32 - "Find Tag Matches Script"
Cohesion: 1.0
Nodes (0): 

### Community 33 - "Debug Pyticker Script"
Cohesion: 1.0
Nodes (0): 

### Community 34 - "Check Script"
Cohesion: 1.0
Nodes (0): 

### Community 35 - "Malformed Tags Script"
Cohesion: 1.0
Nodes (0): 

### Community 36 - "Mismatch Script"
Cohesion: 1.0
Nodes (0): 

### Community 37 - "Fetch Served HTML Script"
Cohesion: 1.0
Nodes (0): 

### Community 38 - "API Test Script"
Cohesion: 1.0
Nodes (0): 

### Community 39 - "Count Divs All Script"
Cohesion: 1.0
Nodes (0): 

### Community 40 - "Find All Unclosed Script"
Cohesion: 1.0
Nodes (0): 

### Community 41 - "Check YF Keys"
Cohesion: 1.0
Nodes (0): 

### Community 42 - "Check All YF Keys"
Cohesion: 1.0
Nodes (0): 

### Community 43 - "Pandas Dependency"
Cohesion: 1.0
Nodes (1): pandas Data Processing

### Community 44 - "Scipy Dependency"
Cohesion: 1.0
Nodes (1): scipy Scientific Computing

### Community 45 - "Pytickersymbols Dependency"
Cohesion: 1.0
Nodes (1): pytickersymbols Stock Index Data

### Community 46 - "Git Remote Config"
Cohesion: 1.0
Nodes (1): GitHub Remote Repository kmerlo/Stocks_Screener

### Community 47 - "Appunti Portfolio View"
Cohesion: 1.0
Nodes (1): Portfolio View

### Community 48 - "Appunti Screening View"
Cohesion: 1.0
Nodes (1): Screening View

### Community 49 - "Appunti Frontend State"
Cohesion: 1.0
Nodes (1): Frontend Global State

### Community 50 - "Test Strategy Transaction"
Cohesion: 1.0
Nodes (1): Test Strategy: Transaction Rollback

### Community 51 - "Test Strategy HTTP API"
Cohesion: 1.0
Nodes (1): Test Strategy: Via HTTP API

## Knowledge Gaps
- **94 isolated node(s):** `Parses a CSV string with semicolon separator to extract tickers.     Format: ya`, `Get list of tables in a SQLite database.`, `Copy all data from a table in src_conn to same table in dst_conn.`, `Investing.com Portfolio Scraper Uses Selenium with the user's existing Chrome p`, `Returns the path to Chrome's user data directory.` (+89 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Portfolio Test`** (2 nodes): `test_portfolio.py`, `run_tests()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Edge Case Test`** (2 nodes): `test_edge.py`, `test()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Div Check Script`** (2 nodes): `get_line_col()`, `scratch_check_divs.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Div Check Complete Script`** (2 nodes): `get_line_col()`, `scratch_check_divs_complete.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server Logs`** (2 nodes): `Server Running on Port 8002`, `Uvicorn Server Log`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Print View Parents Script`** (1 nodes): `scratch_print_view_parents_bs4.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Count Divs Script`** (1 nodes): `scratch_count_divs.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `List Views Script`** (1 nodes): `scratch_list_views.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Find Tag Matches Script`** (1 nodes): `scratch_find_tag_matches.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Debug Pyticker Script`** (1 nodes): `debug_pyticker.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Check Script`** (1 nodes): `scratch_check.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Malformed Tags Script`** (1 nodes): `scratch_find_malformed_tags.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Mismatch Script`** (1 nodes): `scratch_find_mismatch.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Fetch Served HTML Script`** (1 nodes): `scratch_fetch_served_html.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `API Test Script`** (1 nodes): `test_api.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Count Divs All Script`** (1 nodes): `scratch_count_divs_all.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Find All Unclosed Script`** (1 nodes): `scratch_find_all_unclosed.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Check YF Keys`** (1 nodes): `check_yf_keys.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Check All YF Keys`** (1 nodes): `check_all_yf_keys.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Pandas Dependency`** (1 nodes): `pandas Data Processing`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Scipy Dependency`** (1 nodes): `scipy Scientific Computing`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Pytickersymbols Dependency`** (1 nodes): `pytickersymbols Stock Index Data`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Git Remote Config`** (1 nodes): `GitHub Remote Repository kmerlo/Stocks_Screener`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Appunti Portfolio View`** (1 nodes): `Portfolio View`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Appunti Screening View`** (1 nodes): `Screening View`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Appunti Frontend State`** (1 nodes): `Frontend Global State`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Test Strategy Transaction`** (1 nodes): `Test Strategy: Transaction Rollback`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Test Strategy HTTP API`** (1 nodes): `Test Strategy: Via HTTP API`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `get_brokers()` connect `Screening/DB Core` to `Pydantic API Schemas`?**
  _High betweenness centrality (0.058) - this node is a cross-community bridge._
- **Why does `BrokerWithBackpack` connect `Pydantic API Schemas` to `Screening/DB Core`?**
  _High betweenness centrality (0.058) - this node is a cross-community bridge._
- **Are the 14 inferred relationships involving `FinanceLogic` (e.g. with `PriceData` and `ScreeningValue`) actually correct?**
  _`FinanceLogic` has 14 INFERRED edges - model-reasoned connections that need verification._
- **Are the 25 inferred relationships involving `Broker` (e.g. with `FinanceLogic` and `Downloads data from yfinance and saves to DB. Incremental approach if data exist`) actually correct?**
  _`Broker` has 25 INFERRED edges - model-reasoned connections that need verification._
- **Are the 26 inferred relationships involving `ScreeningColumn` (e.g. with `FinanceLogic` and `Downloads data from yfinance and saves to DB. Incremental approach if data exist`) actually correct?**
  _`ScreeningColumn` has 26 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Parses a CSV string with semicolon separator to extract tickers.     Format: ya`, `Get list of tables in a SQLite database.`, `Copy all data from a table in src_conn to same table in dst_conn.` to the rest of the system?**
  _94 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Screening/DB Core` be split into smaller, more focused modules?**
  _Cohesion score 0.02 - nodes in this community are weakly interconnected._