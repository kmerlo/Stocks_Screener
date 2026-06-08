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

## Convenzioni

- `uv` per pacchetti e run.
- Python >= 3.11 (`.python-version`).
- `.venv/` e `*.db` in `.gitignore` (eccetto `config.db` che è versionato).
- CSV ticker: delimitatore `;`, formato `yahoo_ticker;name`.
- `uv.lock` committato (lockfile).
- File di test o di appoggio temporaneo (non destinati alla produzione) vanno creati dentro `./test/`, mai nella directory principale del progetto.
- **Vietato `db.query(...).delete()` su tabelle utente** di `config.db` in qualsiasi script di test/manutenzione. Vedi sezione "Test" sopra.
