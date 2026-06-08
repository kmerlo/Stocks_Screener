from finance_logic import FinanceLogic
import database as db_mod
import json
from datetime import datetime

def verify_roc_caching():
    fl = FinanceLogic()
    db_mod.init_db()
    db = db_mod.SessionLocal()
    
    symbol = "AAPL"
    print(f"--- 1. Testing yfinance download for {symbol} ---")
    success = fl.download_and_save_data(db, symbol, period="1y")
    if not success:
        print("Download failed.")
        return

    # Create dummy tickers
    tickers = [db_mod.Ticker(symbol=symbol, list_id=1)]
    roc_periods = [1, 20, 60]

    print(f"\n--- 2. Running ROC Screening (Should Calculate and Cache) ---")
    start = datetime.now()
    results1 = fl.run_modular_screening(db, tickers, roc_periods)
    duration1 = datetime.now() - start
    print(f"Duration: {duration1}")
    print(f"Results for {symbol}: {results1[0]['data']}")
    
    # Check if ROC values are in DB using the internal keys
    for n in roc_periods:
        key = f"roc_length{n}_D"
        count = db.query(db_mod.ScreeningValue).filter(
            db_mod.ScreeningValue.symbol == symbol,
            db_mod.ScreeningValue.indicator_key == key
        ).count()
        print(f"Cached entries for {key}: {count}")

    print(f"\n--- 3. Running ROC Screening again (Should Use Cache) ---")
    start = datetime.now()
    results2 = fl.run_modular_screening(db, tickers, roc_periods)
    duration2 = datetime.now() - start
    print(f"Duration: {duration2}")
    
    if duration2 < duration1:
        print(f"SUCCESS: ROC Cache is faster! ({duration2} vs {duration1})")
    else:
        print(f"WARNING: Cache not significantly faster? ({duration2} vs {duration1})")
        
    db.close()

if __name__ == "__main__":
    verify_roc_caching()
