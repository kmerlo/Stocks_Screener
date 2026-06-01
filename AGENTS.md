# AGENTS.md — Stocks Screener

## Commands

```bash
uv run uvicorn main:app --host 0.0.0.0 --port 8000 --reload   # dev server
```
Usa **uv** (non pip/poetry). Dipendenze in `pyproject.toml`, lock in `uv.lock`.

## Architettura

- **FastAPI** single‑page app (no monorepo). Entrypoint: `main:app`.
- **SQLite** (`finance_app.db`) via SQLAlchemy, inizializzato all'avvio (`lifespan` handler).
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

## Test

Nessun framework di test (no pytest). I test sono script manuali con `requests`:
```bash
uv run python test_api.py
```

## Convenzioni

- `uv` per pacchetti e run.
- Python >= 3.11 (`.python-version`).
- `.venv/` e `finance_app.db` in `.gitignore`.
- CSV ticker: delimitatore `;`, formato `yahoo_ticker;name`.
- `uv.lock` committato (lockfile).
