# AGENTS.md — Stocks Screener

## Comandi

```bash
uv run uvicorn main:app --host 0.0.0.0 --port 8000 --reload   # dev server
```
Usa **uv** (non pip/poetry). Dipendenze in `pyproject.toml`, lock in `uv.lock`.

## Architettura

- **FastAPI** single‑page app (no monorepo). Entrypoint: `main:app`.
- **Due database SQLite**:
  - `config.db` (versionato in Git): dati di configurazione utente (liste, portafogli, transazioni, disegni, allarmi, template, mappings)
  - `market.db` (gitignored): dati di mercato (quotazioni, fondamentali, indicatori di screening) - rigenerabili da internet
- **Frontend**: static SPA servita da `static/` (index.html). Il server monta `"/"` su `StaticFiles`.
- **Core logic** in `finance_logic.py` (classe `FinanceLogic`):
  - Dati: yfinance (`auto_adjust=False`)
  - Indicatori tecnici: `pandas-ta-classic` (non `pandas-ta`)
  - Screening parallelo via `ProcessPoolExecutor`
  - Caching dei valori screening in tabella `ScreeningValue`
- **Investing.com scraper** (`investing_scraper.py`): Selenium + Chrome, usa profilo temporaneo. Chrome **deve essere chiuso** prima di chiamarlo.
- **Google Sheets** opzionale: richiede credenziali in `python-to-gsheet-*.json` (gitignorato).

## Database

- Auto‑crea due `ScreeningSheet` all'avvio: `"base"` e `"roc"`.
- Il comando `vacuum` esegue `VACUUM` SQLite fuori transazione (usa `raw_connection()`).

## Variabili d'ambiente

- `CONFIG_DATABASE_URL`: URL per il database di configurazione (default: `sqlite:///./config.db`)
- `MARKET_DATABASE_URL`: URL per il database di mercato (default: `sqlite:///./market.db`)

## Watchlist Investing.com Pro — estrazione dati

```bash
uv run python refresh_watchlist.py
```

Estrae la tabella "Vista Mercato" dalla watchlist Investing.com Pro in `CSV/watchlist_vista_mercato.csv`.
- Avvia Chrome in finestra visibile con remote debugging su porta 9222
- Apre la pagina della watchlist
- Aspetta che l'utente faccia login e prema INVIO
- Estrae i dati via Chrome DevTools Protocol dal DOM react-table
- Usa `--no-chrome` se Chrome è già avviato con `--remote-debugging-port=9222`
- I dati di sessione sono persistenti in `/tmp/chrome_watchlist/` (non scadono finché non cancelli la dir)

## Test

Nessun framework di test (no pytest). I test sono script manuali con `requests`:
```bash
uv run python test/test_api.py
```

### Regola critica: MAI toccare `config.db` o `market.db` durante i test

- `config.db` contiene i dati reali dell'utente (portafogli, transazioni, dividendi, disegni, allarmi, liste, mappings, template).
- `market.db` contiene i dati di mercato (quotazioni, fondamentali, indicatori) che possono essere rigenerati da internet.

Per i test usare **sempre** una di queste strategie:

1. **DB separato**: copia `config.db` in `config_test.db` e `market.db` in `market_test.db`, poi imposta le variabili d'ambiente:
   ```bash
   cp config.db config_test.db
   cp market.db market_test.db
   CONFIG_DATABASE_URL="sqlite:///./config_test.db" MARKET_DATABASE_URL="sqlite:///./market_test.db" uv run python -c "..."
   ```
2. **Transazione con rollback**: per test one-shot aprire una `SessionLocal()` ed eseguire tutto dentro un `try/except` con `db.rollback()` esplicito, **mai** `db.query(...).delete()` su tabelle utente.
3. **Test via API**: preferire chiamate HTTP (`requests.post/put/delete` a `localhost:8000`) usando oggetti di test creati ad-hoc, poi `DELETE` esplicito dell'ID creato. **Non creare MAI record di test direttamente via SQLAlchemy** con nomi reali.

Vietato:
- `db.query(Portfolio).delete()` o simili diretti su tabelle utente.
- `DELETE FROM ...` in SQL raw su tabelle utente senza `BEGIN; ... ROLLBACK;`.
- Cancellare/riscrivere `config.db` o `market.db` anche "solo per un attimo".

Se un test deve usare dati seed realistici (es. portafoglio "TestDividendi"), crearlo via API `POST /portfolios/` e marcarlo con nome riconoscibile, poi eliminarlo al termine con `DELETE /portfolios/{id}`.

## Euronext ISIN Integration (giugno 2026)

### Modello Ticker (database.py)

Il modello `Ticker` ora supporta sia symbol Yahoo che ISIN Euronext:

| Colonna | Tipo | Note |
|---------|------|------|
| `symbol` | String, nullable | Yahoo ticker (null per strumenti solo ISIN) |
| `name` | String, nullable | Nome descrittivo |
| `isin` | String, nullable, index | Codice ISIN a 12 caratteri |
| `mic` | String, nullable, default "ETLX" | Mercato (ETLX, SEDX, XPAR, ...) |

Unique constraint: `(symbol, list_id)` e `(isin, list_id)`.

### Download dati Euronext (`euronext_downloader.py`)

```python
from euronext_downloader import download_euronext_csv
df = download_euronext_csv(isin="DE000HC9XDX7", mic="ETLX")
```

- API endpoint: `GET /{lang}/ajax/AwlHistoricalPrice/getFullDownloadAjax/{ISIN}-{MIC}?format=csv&...`
- Formato CSV: delimitatore `,`, date `dd/mm/YYYY`, decimali `.`
- Colonne restituite: Date (index), Open, High, Low, Close, Adj Close, Volume
- Usa `requests` (no Selenium)

### Dispatche automatico (`update_ticker_by_id`)

`finance_logic.py` → `update_ticker_by_id(db, ticker_id, period)`:
- Se `ticker.symbol` presente → yfinance (comportamento esistente)
- Se `ticker.symbol` assente ma `ticker.isin` presente → `euronext_downloader.download_euronext_csv()`
- I dati salvati in `PriceData` usano l'ISIN come `symbol`

### API endpoints (main.py)

| Metodo | Path | Descrizione |
|--------|------|-------------|
| `POST` | `/lists/{list_id}/tickers/` | Crea ticker (symbol e/o isin) |
| `PUT` | `/tickers/{ticker_id}` | Modifica symbol/isin/mic/nome |
| `POST` | `/tickers/by-id/{ticker_id}/update-data/` | Dispatch automatico |
| `DELETE` | `/lists/{list_id}/tickers/by-id/{ticker_id}` | Elimina per ID (ISIN) |

### Frontend

- Form "Add Ticker" ora ha campi: Symbol, ISIN, MIC (select)
- Ticker tag mostrano: `SYMBOL - Nome [ISIN] (MIC) [Yahoo/Euronext]`
- Chart slot dropdown mostra fonte: `[Y]` o `[E]`
- Pulsante "Agg. Dati" chiama `by-id/{id}/update-data` per dispatch automatico
- `window.tickerIdMap` mappa symbol/isin → ID ticker

### Screening

Screening usa `t.isin` come fallback se `t.symbol` è nullo:
```python
symbol = t.symbol if t.symbol else t.isin
```

### Import CSV

Formato aggiornato (delimitatore `;`):
```
symbol;name;isin;mic
AAPL;Apple Inc.;;
;Nome Certificato;DE000HC9XDX7;ETLX
```

### CSV Euronext — formato reale

Il CSV scaricato da `live.euronext.com` usa **`;`** come delimitatore (non `,`), con 3 righe di metadati iniziali:
```
"Historical Data"
"From 2025-06-15 to 2026-06-15"
DE000HC9XDX7
Date;Open;High;Low;Last;Close;"Number of Shares";"Number of Trades";Turnover
15/06/2026;99.23;99.42;99.02;99.27;99.27;120;2;11890;99.0867
```

Nota: c'è una **colonna extra** (`99.0867` = VWAP) non dichiarata nell'header. Il codice in `euronext_downloader.py` la rimuove con `line.rsplit(";", 1)[0]` prima del parsing.

### Problemi risolti

1. **Delimitatore**: era `","` ma il CSV reale usa `";"`.
2. **Righe metadati**: saltate cercando la riga che inizia con `"Date;"`.
3. **Colonna extra VWAP**: rimossa con `rsplit(";", 1)[0]` su ogni riga dati.
4. **Date**: parse con `dayfirst=True` (formato `dd/mm/YYYY`).

### Problemi noti

- ISIN inesistente su Euronext → risposta HTML invece di CSV → errore in `pd.read_csv`.
- Rate limiting → aggiungere `time.sleep(0.5)` tra richieste.
- Certificato emesso da meno di 1 anno → la `startdate` di default (365gg fa) potrebbe non avere dati.

### Debug

```bash
curl -o /tmp/test.csv "https://live.euronext.com/en/ajax/AwlHistoricalPrice/getFullDownloadAjax/DE000HC9XDX7-ETLX?format=csv&decimal_separator=.&date_form=d%2Fm%2FY&adjusted=Y&startdate=2025-06-15&enddate=2026-06-15"
```

## Convenzioni

- `uv` per pacchetti e run.
- Python >= 3.11 (`.python-version`).
- `.venv/` e `*.db` in `.gitignore` (eccetto `config.db` che è versionato).
- CSV ticker: delimitatore `;`, formato `symbol;name;isin;mic` (4 colonne).
- `uv.lock` committato (lockfile).
- File di test o di appoggio temporaneo (non destinati alla produzione) vanno creati dentro `./test/`, mai nella directory principale del progetto.
- **Vietato `db.query(...).delete()` su tabelle utente** di `config.db` in qualsiasi script di test/manutenzione. Vedi sezione "Test" sopra.
