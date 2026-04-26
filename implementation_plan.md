# Implementation Plan - Date-based Data Deletion

The user wants to clean up data "holes" by deleting records from a certain date onwards and then re-triggering the update (which now correctly fills gaps). This plan adds a "Pulisci" (Clean) feature that deletes data from a selected date and supports bulk operations via the "Lista" flag.

## User Review Required

> [!IMPORTANT]
> The deletion is permanent. A confirmation dialog will be shown to the user, especially during bulk operations.

## Proposed Changes

### Backend Logic

#### [MODIFY] [finance_logic.py](file:///home/roberto/Documents/progetti/Stocks_Screener/finance_logic.py)
- Add `delete_data_from(db, symbol, start_date)` to handle the SQL deletion logic using a `>=` filter on the date.

#### [MODIFY] [main.py](file:///home/roberto/Documents/progetti/Stocks_Screener/main.py)
- Add a new DELETE endpoint `/tickers/{symbol}/data-from/` that accepts a `date` query parameter.

### Frontend UI

#### [MODIFY] [index.html](file:///home/roberto/Documents/progetti/Stocks_Screener/static/index.html)
- Add a date input (`<input type="date">`) and a "Pulisci" button in the header, next to the "Elimina" button.

#### [MODIFY] [script.js](file:///home/roberto/Documents/progetti/Stocks_Screener/static/script.js)
- Implement the click handler for the new "Pulisci" button.
- Logic will support the `bulk-apply` checkbox:
    - If checked: Iterate through all tickers in the active list and call the deletion endpoint for each.
    - If NOT checked: Delete data only for the currently active ticker.
- Refresh the chart after deletion if the active ticker was affected.


