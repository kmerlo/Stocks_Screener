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

### Regola critica: MAI toccare `finance_app.db` durante i test

`finance_app.db` contiene i dati reali dell'utente (portafogli, transazioni, dividendi, disegni, allarmi). **Non è versionato** (`*.db` in `.gitignore`) e **non ha backup**: una cancellazione è irreversibile.

Per i test usare **sempre** una di queste strategie:

1. **DB separato**: copia `finance_app.db` in `finance_app_test.db` e imposta `SQLALCHEMY_DATABASE_URL` via env var prima dell'import.
   ```bash
   cp finance_app.db finance_app_test.db
   SQLALCHEMY_DATABASE_URL="sqlite:///./finance_app_test.db" uv run python -c "..."
   ```
2. **Transazione con rollback**: per test one-shot aprire una `SessionLocal()` ed eseguire tutto dentro un `try/except` con `db.rollback()` esplicito, **mai** `db.query(...).delete()` su tabelle utente.
3. **Test via API**: preferire chiamate HTTP (`requests.post/put/delete` a `localhost:8000`) usando `Portfolio` di test creato ad-hoc, poi `DELETE` esplicito dell'ID creato. **Non creare MAI record di test direttamente via SQLAlchemy** con nomi reali.

Vietato:
- `db.query(Portfolio).delete()` o simili diretti su tabelle utente.
- `DELETE FROM ...` in SQL raw su tabelle utente senza `BEGIN; ... ROLLBACK;`.
- Cancellare/riscrivere `finance_app.db` anche "solo per un attimo".

Se un test deve usare dati seed realistici (es. portafoglio "TestDividendi"), crearlo via API `POST /portfolios/` e marcarlo con nome riconoscibile, poi eliminarlo al termine con `DELETE /portfolios/{id}`.

## Convenzioni

- `uv` per pacchetti e run.
- Python >= 3.11 (`.python-version`).
- `.venv/` e `finance_app.db` in `.gitignore`.
- CSV ticker: delimitatore `;`, formato `yahoo_ticker;name`.
- `uv.lock` committato (lockfile).
- **Vietato `db.query(...).delete()` su tabelle utente** di `finance_app.db` in qualsiasi script di test/manutenzione. Vedi sezione "Test" sopra.
