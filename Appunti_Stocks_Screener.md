# Appunti Stocks Screener

Panoramica:
Il mio interesse sta crescendo sempre più nel campo finanziario e ho deciso di iniziare un progetto personale. Ho deciso di sviluppare un'applicazione web full-stack che mi permetta di analizzare i mercati finanziari in modo approfondito, in particolare le azioni.

---

## 1. Panoramica dell'Applicazione

**Stocks Screener** è un'applicazione web full-stack per l'analisi finanziaria personale. Permette di:

- Gestire liste di ticker azionari
- Scaricare e visualizzare dati storici di prezzo (via **yfinance**)
- Visualizzare grafici interattivi con candele e indicatori tecnici
- Eseguire screening multidimensionali (tecnici e fondamentali)
- Disegnare su grafici (linee, trend, Fibonacci, canali, ecc.) con allarmi di prezzo
- Importare dati da **Google Sheets** e **Investing.com** (scraping via Selenium)

---

## 2. Stack Tecnologico

| Livello     | Tecnologia                                                  |
|-------------|-------------------------------------------------------------|
| Backend     | **FastAPI** (Python 3.11+), **Uvicorn** (ASGI server)       |
| Database    | **SQLite** tramite **SQLAlchemy** ORM                       |
| Dati Finanziari | **yfinance**, **PyTickerSymbols**, **pandas**, **pandas-ta-classic** |
| Scraping    | **Selenium** (Chrome/Chromium) per Investing.com            |
| Google API  | **gspread** con Service Account                             |
| Frontend    | HTML/CSS/JS vanilla + **Lightweight Charts** (TradingView)  |
| Gestione Deps | **uv** (gestore pacchetti Python moderno)                 |

---

## 3. Struttura dei File del Progetto

```
Stocks_Screener/
├── main.py                  # Entry point FastAPI – tutti gli endpoint REST (~2000 righe)
├── database.py              # Modelli SQLAlchemy (ORM) e configurazione DB
├── schemas.py               # Schemi Pydantic per validazione request/response
├── finance_logic.py         # Logica business: download dati, calcolo indicatori, screening, portafoglio, FX
├── investing_scraper.py     # Scraper Selenium per Investing.com (portfolio/CSV)
├── pyproject.toml           # Dipendenze e configurazione progetto (uv)
├── finance_app.db           # Database SQLite (generato a runtime)
├── python-to-gsheet-*.json  # Credenziali Service Account per Google Sheets
├── static/
│   ├── index.html           # Pagina principale SPA (~1075 righe)
│   ├── script.js            # Tutta la logica frontend (~275K, ~7000+ righe)
│   └── style.css            # Stili CSS (~21K)
├── CSV/                     # Cartella per CSV scaricati da Investing.com
├── liste_tickers/           # Eventuali liste ticker locali
└── .agent/                  # Configurazione agente/workflow
```

---

## 4. Architettura Backend

### 4.1 Entry Point (`main.py`)

L'applicazione FastAPI viene avviata con:

```bash
uv run main.py
# oppure:
uv run uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

`uv` capisce automaticamente in quale cartella ti trovi, individua la cartella `.venv` del progetto e avvia **Uvicorn** direttamente all'interno di quell'ambiente virtuale isolato, facendoti risparmiare un passaggio.

Se invece vuoi comunque attivare l'ambiente (metodo classico):

```bash
source .venv/bin/activate
```

Vedrai comparire `(.venv)` all'inizio della riga di comando del tuo terminale. Per disattivare: `deactivate`.

**Lifespan**: All'avvio crea le tabelle DB e inizializza i fogli di screening di sistema ("base" e "roc").

**Middleware CORS**: Abilitato per sviluppo locale.

**Servizio Frontend**: I file statici della cartella `static/` vengono serviti direttamente da FastAPI (`StaticFiles`), così tutto funziona con un unico processo.

### 4.2 Database (`database.py`)

Usa **SQLAlchemy ORM** con SQLite (`finance_app.db`). Le tabelle principali sono:

| Tabella               | Descrizione                                                         |
|-----------------------|---------------------------------------------------------------------|
| `ticker_lists`        | Liste di ticker (es. "S&P 500", "Watchlist Italia")                 |
| `tickers`             | Singoli ticker associati a una lista (symbol + name + list_id)      |
| `price_data`          | Dati OHLCV giornalieri per ogni ticker (con UniqueConstraint su symbol+date) |
| `chart_templates`     | Template di configurazione chart (quali indicatori mostrare)        |
| `template_indicators` | Indicatori associati a un template (tipo, parametri, pane, colore)  |
| `screening_sheets`    | Fogli di screening personalizzabili                                 |
| `screening_columns`   | Colonne/indicatori di ogni foglio di screening                      |
| `screening_values`    | **Cache** dei valori degli indicatori calcolati (per evitare ricalcoli) |
| `drawings`            | Disegni persistenti sui grafici (linee, fibonacci, ecc.)            |
| `alarms`              | Allarmi di prezzo associati ai disegni                              |
| `fundamental_data`    | Dati fondamentali (P/E, Market Cap, Revenue, ecc.) per ticker       |
| `historical_fundamental_data` | Snapshot fondamentali storici associati a una data trimestrale (per far variare i dati col giorno selezionato sul grafico) |
| `ticker_mappings`     | Mappatura Yahoo → Investing.com per ogni ticker                     |
| `portfolio_urls`      | URL salvati per i portafogli di Investing.com                       |
| `portfolio`           | Portafogli di investimento con nome, valuta base, e cash            |
| `commission_plans`    | Piani commissionali (commissioni fisse/percentuali per broker)      |
| `transaction`         | Transazioni di portafoglio (acquisti, vendite, dividendi, versamenti) con supporto multi-valuta |

### 4.3 Schemi Pydantic (`schemas.py`)

Definisce i modelli di validazione per ogni endpoint:

- **CRUD classico**: `TickerListCreate/TickerList`, `TickerCreate/Ticker`, `PriceData`
- **Indicatori**: `IndicatorRequest`, `TemplateIndicatorBase/Create`, `ChartTemplateCreate/Update`
- **Screening**: `ScreeningRequest`, `DynamicScreeningRequest`, `ModularScreeningResult`
- **Disegni**: `DrawingBase/Create/Sync`, `DrawingPoint`, con `field_validator` per parsare i punti da stringa JSON
- **Allarmi**: `AlarmBase/Create/Alarm/AlarmOut`
- **Fondamentali**: `FundamentalDataBase/FundamentalData`, `FundamentalUpdate`, `HistoricalFundamentalDataBase/HistoricalFundamentalData`
- **Mappature**: `TickerMappingBase/Create/TickerMapping`
- **Portafoglio**: `PortfolioBase/Create/Portfolio`, `PortfolioURLBase/Create/PortfolioURL`
- **Transazioni**: `TransactionBase/Create/Transaction`
- **Commissioni**: `CommissionPlanBase/Create/CommissionPlan`

### 4.4 Logica Finanziaria (`finance_logic.py`)

Classe singleton `FinanceLogic` (istanziata come `finance_logic` a fine modulo). Funzionalità principali:

#### Download e Gestione Dati

- **`download_and_save_data()`**: Download incrementale da yfinance. Se esistono dati nel DB, scarica solo dal giorno dell'ultimo record in poi (per aggiornare l'ultima candela incompleta).
- **`extend_history()`**: Estende la storia **all'indietro** (prima del record più vecchio).
- **`_process_yf_df()`**: Processa il DataFrame di yfinance, gestisce multi-index, timezone, e fa upsert (insert o update) nel DB.
- **`delete_ticker_data()`** / **`delete_data_from()`**: Cancella dati prezzi per un ticker (totale o da una data in poi).
- **`delete_all_prices()`**: Svuota tutta la tabella prezzi.
- **`vacuum_database()`**: Esegue `VACUUM` SQLite per ridurre dimensioni file.

#### Calcolo Indicatori

- **`calculate_indicators()`**: Calcola indicatori tecnici usando **pandas-ta-classic** (`df.ta.sma()`, `df.ta.rsi()`, ecc.). Supporta: SMA, EMA, RSI, MACD, Bollinger Bands, Stoch, Donchian, Supertrend, ATR, CCI, ROC, BBP, Volume, ecc.
- **`calculate_ma_slope()`**: Calcola la pendenza (slope) di una media mobile su un numero di periodi.
- Supporta **timeframe multipli**: Daily (D), Weekly (W), Monthly (M) tramite resampling del DataFrame.
- **`generate_indicator_key()`**: Genera chiave univoca per ogni combinazione indicatore/parametri/timeframe (usata per caching).

#### Screening

- **`run_modular_screening()`**: Screening con periodi ROC configurabili.
- **`run_dynamic_screening()`**: Screening generico con **sistema di caching** avanzato:
  1. Controlla nella tabella `screening_values` se i valori sono aggiornati
  2. Se la data dell'ultimo valore cached corrisponde all'ultimo prezzo, lo usa
  3. Altrimenti, ricalcola con **ProcessPoolExecutor** (parallelismo multi-processo)
  4. Salva i nuovi valori nella cache DB con `bulk_save_objects`
- **`_calculate_worker()`**: Worker statico per calcoli paralleli. Calcola anche **distanza % dal MA** e **giorni consecutivi sopra/sotto** per medie mobili.

#### Allarmi

- **`check_alarms()`**: Controlla se gli allarmi attivi sono stati scattati confrontando le ultime due candele con i livelli definiti dai disegni (linee orizzontali, trend line, ray). Supporta trigger "close" e "intraday".

#### Dati Fondamentali

- **`update_fundamental_data()`**: Scarica dati fondamentali da yfinance (Market Cap, P/E, Revenue, Margins, Debt, ecc.) e li salva/aggiorna nel DB.
- **`get_fundamental_data()`**: Legge fondamentali correnti dal DB.
- **`get_historical_fundamental_data()`**: Cerca il record fondamentale più vicino a una data specifica (basato su `quarter_date`). Fondamentale per società con calendari fiscali non standard (es. CRM).
- **`update_list_fundamentals()`**: Aggiornamento batch per tutti i ticker di una lista.

#### Gestione Portafoglio e Tassi di Cambio

- **`get_portfolio_summary()`**: Calcola il riepilogo di un portafoglio: posizioni aperte, PMC in valuta base e strumento, P&L realizzato/non realizzato, controvalori, liquidità residua.
- **`get_fx_rate()`**: Recupera il tasso di cambio corrente tra due valute (es. USD→EUR) tramite yfinance.
- **`get_historical_fx_rate()`**: Recupera il tasso di cambio storico a una data specifica.

### 4.5 Scraper Investing.com (`investing_scraper.py`)

Modulo Selenium che:

- **`scrape_investing_portfolio()`**: Naviga un URL portfolio Investing.com, gestisce Cloudflare, cookie, e scrapa le tabelle "Prezzo" e "Sezione tecnica"
- **`download_investing_csv()`**: Automazione download CSV dal portfolio Investing.com
- **`read_local_investing_csv()`**: Legge l'ultimo CSV già scaricato dalla cartella `CSV/` locale
- Usa Chrome/Chromium con directory temporanea per il profilo utente, con evasione anti-bot

---

## 5. API Endpoints (Riepilogo)

### Ticker Lists

| Metodo | Endpoint                                  | Descrizione                        |
|--------|-------------------------------------------|------------------------------------|
| POST   | `/lists/`                                 | Crea nuova lista                   |
| GET    | `/lists/`                                 | Elenco liste                       |
| DELETE | `/lists/{list_id}`                        | Elimina lista                      |
| POST   | `/lists/{list_id}/tickers/`               | Aggiungi ticker (con validazione yfinance) |
| DELETE | `/lists/{list_id}/tickers/{symbol}`       | Rimuovi ticker                     |
| DELETE | `/lists/{list_id}/clear-tickers`          | Svuota tutti i ticker              |
| POST   | `/lists/{list_id}/fetch-names`            | Recupera nomi mancanti da yfinance |
| POST   | `/lists/{list_id}/import-index/{index}`   | Importa ticker da indice (pytickersymbols) |
| POST   | `/lists/{list_id}/upload-csv/`            | Importa ticker da file CSV         |

### Dati Prezzo

| Metodo | Endpoint                                  | Descrizione                                     |
|--------|-------------------------------------------|-------------------------------------------------|
| POST   | `/tickers/{symbol}/update-data/`          | Download/aggiornamento incrementale dati         |
| POST   | `/tickers/{symbol}/extend-history/{years}`| Estendi storia al passato                        |
| GET    | `/tickers/{symbol}/data/`                 | Leggi dati storici dal DB                        |
| DELETE | `/tickers/{symbol}/data/`                 | Elimina tutti i dati di un ticker                |
| DELETE | `/tickers/{symbol}/data-from/?date=`      | Elimina dati da una data in poi ("Pulisci")      |

### Screening

| Metodo | Endpoint                        | Descrizione                              |
|--------|---------------------------------|------------------------------------------|
| POST   | `/screening/run`                | Screening ROC multi-periodo              |
| POST   | `/screening/run-dynamic`        | Screening dinamico con colonne custom    |
| GET/POST/DELETE | `/screening/sheets/...` | CRUD fogli di screening                  |
| POST/PUT/DELETE | `/screening/columns/...`| CRUD colonne di screening                |

### Indicatori & Template

| Metodo | Endpoint                            | Descrizione                          |
|--------|-------------------------------------|--------------------------------------|
| POST   | `/indicators/{symbol}/calculate`    | Calcola indicatori per il grafico    |
| GET/POST/PUT/DELETE | `/templates/...`    | CRUD template configurazione chart   |

### Disegni & Allarmi

| Metodo | Endpoint                                    | Descrizione                    |
|--------|---------------------------------------------|--------------------------------|
| GET/POST/PUT/DELETE | `/tickers/{symbol}/drawings/...` | CRUD disegni per ticker        |
| POST   | `/tickers/{symbol}/drawings/sync`           | Migrazione bulk da localStorage|
| GET    | `/alarms/`                                  | Tutti gli allarmi              |
| POST/DELETE | `/drawings/{id}/alarm`                 | Crea/elimina allarme           |

### Fondamentali

| Metodo | Endpoint                                    | Descrizione                         |
|--------|---------------------------------------------|-------------------------------------|
| GET    | `/tickers/{symbol}/fundamentals`            | Leggi fondamentali dal DB           |
| POST   | `/tickers/{symbol}/fundamentals/update`     | Aggiorna da yfinance                |
| GET    | `/tickers/{symbol}/fundamentals/historical` | Leggi fondamentali storici per data (quarter_date) |
| GET    | `/lists/{list_id}/fundamentals`             | Fondamentali per lista              |
| POST   | `/lists/{list_id}/fundamentals/update`      | Aggiorna fondamentali per lista     |

### Ticker Mappings (Yahoo ↔ Investing)

| Metodo | Endpoint                         | Descrizione                            |
|--------|----------------------------------|----------------------------------------|
| GET    | `/tickers/mapping/`              | Elenco mappature                       |
| POST   | `/tickers/mapping/`              | Crea mappatura                         |
| DELETE | `/tickers/mapping/{mapping_id}`  | Elimina mappatura                      |
| POST   | `/tickers/mapping/import/`       | Importa mappature da CSV               |
| GET    | `/tickers/mapping/export/`       | Esporta mappature in CSV               |

### Portafoglio

| Metodo | Endpoint                                    | Descrizione                                |
|--------|---------------------------------------------|--------------------------------------------|
| GET    | `/portfolios/`                              | Elenco portafogli                          |
| POST   | `/portfolios/`                              | Crea nuovo portafoglio (nome + valuta base)|
| DELETE | `/portfolios/{portfolio_id}`                | Elimina portafoglio                        |
| GET    | `/portfolios/{portfolio_id}/summary`        | Riepilogo: cash, valore posizioni, P&L     |
| GET    | `/portfolios/{portfolio_id}/transactions/`  | Transazioni di un portafoglio              |
| POST   | `/portfolios/{portfolio_id}/transactions/`  | Crea transazione (BUY/SELL/SHORT/COVER/DEPOSIT/WITHDRAWAL) |
| GET    | `/transactions/ticker/{symbol}`             | Transazioni per ticker (per markers sul grafico) |
| PUT    | `/transactions/{transaction_id}`            | Modifica transazione                       |
| DELETE | `/transactions/{transaction_id}`            | Elimina transazione                        |
| GET    | `/commission_plans/`                        | Elenco piani commissionali                 |
| POST   | `/commission_plans/`                        | Crea piano commissionale                   |
| DELETE | `/commission_plans/{plan_id}`               | Elimina piano commissionale                |
| GET    | `/fx_rate`                                  | Tasso di cambio (base, strumento, data)    |

**Gestione Trimestri Variabili**

- La logica ora recupera le date di chiusura reale dei trimestri (campo `quarter_date`) direttamente da Yahoo Finance tramite `yfinance`.
- Il DB `fundamental_data` è stato aggiornato per includere la colonna `quarter_date`.
- Le API ora restituiscono i dati fondamentali associati alla data di chiusura corretta, evitando le precedenti date fittizie (es. 2025-12-31).
- La funzione `get_historical_fundamental_data` in `finance_logic.py` seleziona il record più vicino alla data richiesta, garantendo coerenza per società con calendari fiscali non standard (es. CRM).

### Google Sheets & Investing.com

| Metodo | Endpoint                         | Descrizione                                |
|--------|----------------------------------|--------------------------------------------|
| GET    | `/gsheet/data`                   | Leggi dati da Google Spreadsheet           |
| GET    | `/investing/portfolio`           | Scraping live da Investing.com (Selenium)  |
| GET    | `/investing/portfolio_csv`       | Download CSV da Investing.com (Selenium)   |
| GET    | `/investing/portfolio_csv_local` | Leggi ultimo CSV locale dalla cartella CSV |
| GET/POST/DELETE | `/investing/urls`     | Gestione URL portfolio salvati             |

### Manutenzione DB

| Metodo | Endpoint                         | Descrizione                        |
|--------|----------------------------------|------------------------------------|
| GET    | `/maintenance/orphans`           | Indicatori orfani nella cache      |
| POST   | `/maintenance/delete-orphans`    | Elimina indicatori orfani          |
| POST   | `/maintenance/clear-prices`      | Svuota tutti i prezzi              |
| POST   | `/maintenance/vacuum`            | Ottimizza database (VACUUM)        |

---

## 6. Architettura Frontend

### 6.1 Struttura Generale

**Single Page Application (SPA)** costruita interamente in HTML/CSS/JS vanilla (senza framework). La navigazione tra le viste è gestita da una **sidebar** laterale.

### 6.2 Le Viste (Sezioni)

| Vista               | Descrizione                                                           |
|----------------------|-----------------------------------------------------------------------|
| **Grafico**          | Grafico interattivo con candele/linea, indicatori, strumenti di disegno, fondamentali sotto il grafico |
| **Portafoglio**      | Gestione completa portafoglio: creazione, posizioni aperte, storico transazioni, piani commissionali, riepilogo P&L con supporto multi-valuta |
| **Ticker Lists**     | Gestione liste: creazione, importazione (CSV, indice, manuale), esportazione |
| **Screening**        | Screening multi-foglio con tab: Base, ROC Analysis, Fundamentals, fogli custom |
| **Dati Storici**     | Tabella dati OHLCV grezzi dal database, ordinabili per data           |
| **Allarmi**          | Elenco allarmi attivi e scattati                                      |
| **Manutenzione DB**  | Due tab: (1) Indicatori Orfani + Svuota Prezzi / VACUUM, (2) Gestione Mappature Yahoo↔Investing con import/export CSV |
| **Google Sheet**     | Visualizzazione dati da Google Spreadsheet con supporto multi-foglio tramite tab dinamici |
| **Investing.com**    | Scraping/importazione portfolio da Investing.com (3 modalità: web scraping, CSV web, CSV locale) |
| **Configurazione**   | Preferenze utente: riapertura automatica fondamentali al cambio ticker |

### 6.3 Componenti Frontend Principali

- **Grafico**: Usa la libreria **Lightweight Charts** (TradingView, v4.2.3) per rendering candele/linea con supporto a multi-pane (sottografici per RSI, MACD, ecc.)
- **Layer di Disegno**: Un `<canvas>` HTML sovrapposto al grafico gestisce tutti gli strumenti di disegno:
  - **Strumenti base**: cursore (mano), modifica, gomma, elimina tutto
  - **Linee**: orizzontale, verticale, trend, ray, estesa, freccia
  - **Forme**: rettangolo, cerchio, triangolo, polilinea, pennello
  - **Fibonacci**: ritracciamento, estensione
  - **Canali**: regressione, parallelo
  - **Annotazioni**: testo, callout, etichetta prezzo
  - **Controlli stile**: selezione colore, slider spessore linea (1-6px)
- **Template Indicatori**: Salvataggio/caricamento di configurazioni di indicatori
- **Screening**: Tabelle con ordinamento per colonna, filtri min/max su ogni colonna ROC o fondamentale, e possibilità di salvare sotto-liste filtrate
- **Crosshair Sync**: Sincronizzazione cursore e range visibile tra grafico principale e sottografici
- **Portfolio Management**: Vista dedicata con tre sezioni:
  - Dashboard riepilogativa (cash, valore posizioni, P&L aperto/realizzato, net liquidity)
  - Tabella posizioni aperte con PMC duale (valuta base + valuta strumento) e filtri per colonna
  - Storico transazioni con tipo (BUY/SELL/SHORT/COVER/DEPOSIT/WITHDRAWAL), controvalore duale, tasso di cambio, e commissioni
- **Transaction Modal**: Form per creare/modificare transazioni con supporto multi-valuta, tasso di cambio, selezione piano commissionale, e campi per short fee
- **Cash Modal**: Deposito/prelievo liquidità dal portafoglio
- **Commission Plans Modal**: Gestione piani commissionali con tipo (assoluto/percentuale), fisso, percentuale, minimo e massimo
- **Alarm Configuration Modal**: Configura allarmi con trigger intraday o su chiusura candela
- **Indicator Configuration Modal**: Configura parametri, colore, stile linea, spessore e opzioni di visualizzazione per ogni indicatore

### 6.4 Stato Frontend (Variabili Globali in `script.js`)

Le variabili principali gestiscono:

- `activeView`: vista corrente
- `activeListId` / `activeTicker`: lista e ticker selezionati
- `mainChart` / `priceSeries`: istanze Lightweight Charts
- `activeIndicators[]`: indicatori attualmente applicati al grafico
- `secondaryCharts[]`: sottografici (RSI, MACD, ecc.)
- `drawings[]`: disegni persistenti
- `screeningResultsCache{}`: cache locale dei risultati di screening
- `tickerMappingsLookup`: Map Yahoo↔Investing per matching ticker
- `activePortfolioId`: portafoglio attualmente selezionato
- `portfolios[]`: lista portafogli
- `activeDrawingTool`: strumento di disegno attivo (cursor, modify, eraser, horizontal_line, trend_line, fib_retracement, ecc.)
- `drawingColor` / `drawingWidth`: stile attuale del disegno selezionato
- `activeTab`: tab attivo nello screening (base, roc, fundamental, o custom)
- `autoReopenFundamentals`: preferenza utente per riapertura automatica fondamentali

---

## 7. Flussi Operativi Principali

### 7.1 Aggiornamento Dati Ticker

1. L'utente seleziona un ticker e clicca "Aggiorna Dati"
2. Frontend chiama `POST /tickers/{symbol}/update-data/`
3. Backend controlla la data dell'ultimo record nel DB
4. Se esistono dati: **download incrementale** (da ultimo record) → upsert
5. Se non esistono: download completo per il periodo specificato (default 1 anno)
6. Dopo il download, `check_alarms()` verifica se allarmi sono scattati

### 7.2 Screening

1. L'utente apre la vista Screening e seleziona un foglio (Base, ROC, Custom)
2. Frontend chiama `POST /screening/run` o `/screening/run-dynamic`
3. Backend controlla la **cache** (`screening_values`):
   - Se aggiornata → restituisce dati cached
   - Se obsoleta → ricalcola con **multi-processo** (`ProcessPoolExecutor`)
4. I risultati vengono mostrati in tabella con filtri e ordinamento
5. L'utente può filtrare e salvare una sotto-lista ("sub-universe")

### 7.3 Portafoglio

1. L'utente crea un portafoglio con nome e valuta base (es. EUR) nella vista Portafoglio
2. Può configurare piani commissionali (commissioni fisse o percentuali, con minimo/massimo)
3. Apre posizioni tramite transazioni BUY/SELL/SHORT/COVER, specificando:
   - Ticker, quantità, prezzo, data
   - Valuta dello strumento e tasso di cambio (strumento → base)
   - Eventuale piano commissionale
4. Le transazioni di tipo DEPOSIT/WITHDRAWAL gestiscono la liquidità
5. Il backend calcola:
   - **PMC** (Prezzo Medio di Carico) sia in valuta base che in valuta strumento
   - **P&L** realizzato e non realizzato
   - **Controvalore** corrente delle posizioni
6. Le transazioni vengono visualizzate come **markers** sul grafico storico del ticker (verde = BUY, rosso = SELL, giallo = DIVIDEND)
7. La tabella posizioni supporta filtri per colonna

### 7.4 Disegni e Allarmi

1. L'utente seleziona uno strumento dalla toolbar di disegno
2. Clicca sul grafico per posizionare i punti
3. Il disegno viene renderizzato sul `<canvas>` e salvato nel DB (`POST /drawings/`)
4. L'utente può associare un allarme a un disegno (`POST /drawings/{id}/alarm`)
5. Ogni volta che i dati vengono aggiornati, `check_alarms()` verifica i livelli

---

## 8. Note Operative

### Avvio rapido

```bash
cd ~/Documents/progetti/Stocks_Screener
uv run main.py
oppure
uv run uvicorn main:app --host 0.0.0.0 --port 8000 --reload

```

L'app sarà disponibile su `http://localhost:8000`.

### Checkbox "Lista" (Bulk Operations)

Nella header bar c'è la checkbox "Lista" che permette di applicare operazioni (Aggiorna Dati, Estendi, Elimina, Pulisci) a **tutti i ticker della lista selezionata** invece che al singolo ticker.

### Database

Il file `finance_app.db` viene creato automaticamente al primo avvio. Per ridurne le dimensioni dopo cancellazioni massive, usare il pulsante "Ottimizza Database (VACUUM)" nella vista Manutenzione.
