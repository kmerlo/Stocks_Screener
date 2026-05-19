# Implementation Plan - Automatic Historical Exchange Rates

The user wants the "Exchange Rate (Instrument -> Base)" field (`#trans-fx`) to be populated automatically by fetching the exchange rate quote from Yahoo Finance corresponding to the transaction date.

## User Review Required

> [!NOTE]
> - Historical exchange rates will be fetched from Yahoo Finance.
> - Because forex markets are closed on weekends, the backend will query a date range around the transaction date and select the closest available trading day's close price.
> - If fetching the historical rate fails, the backend will fall back to the current exchange rate, and then to `1.0` if that also fails.

## Proposed Changes

### Backend (FastAPI / SQLAlchemy)

#### [MODIFY] [main.py](file:///home/roberto/Documents/progetti/Stocks_Screener/main.py)
- Create a new endpoint `GET /fx_rate`:
  - Query parameters:
    - `base_currency: str`
    - `instrument_currency: str`
    - `date: str` (ISO format string)
  - Logic:
    - If `base_currency == instrument_currency`, return `{"rate": 1.0}`.
    - Otherwise, query yfinance for the ticker `f"{instrument_currency}{base_currency}=X"`.
    - Fetch the history for a narrow window (e.g. from `date - 4 days` to `date + 2 days`) to handle weekends and market holidays.
    - Select the trading record closest in date to the transaction date and return its close price.
    - Add fallbacks to current rate and finally to `1.0`.

---

### Frontend

#### [MODIFY] [script.js](file:///home/roberto/Documents/progetti/Stocks_Screener/static/script.js)
- Maintain a global variable `activePortfolioBaseCurrency` populated when the portfolio summary is fetched.
- Implement an async function `updateAutomaticExchangeRate()`:
  - Check the active portfolio's base currency and the selected instrument currency.
  - If they match, set the `#trans-fx` input value to `1.0`.
  - If they differ and a date is selected, call the backend `/fx_rate` endpoint and update the `#trans-fx` field with the retrieved rate.
- Bind `change` event listeners to `#trans-currency` and `#trans-date` inputs to automatically invoke `updateAutomaticExchangeRate()`.
- Automatically invoke `updateAutomaticExchangeRate()` when opening the modal for a **new** transaction.

## Verification Plan

### Automated / Manual Verification
- We will write a unit test script to verify that:
  - `GET /fx_rate` returns `1.0` for identical currencies.
  - `GET /fx_rate` returns the correct rate on a weekday (e.g., USD to EUR).
  - `GET /fx_rate` correctly falls back to the closest weekday rate when querying a weekend date.
- We will perform a manual test using the browser subagent to:
  - Open the "Nuova Transazione" modal.
  - Set the currency to `USD` (if the base currency is `EUR`).
  - Modify the date and verify that the exchange rate field updates automatically.
