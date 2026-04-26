from finance_logic import FinanceLogic
import database as db_mod
import json
from datetime import datetime

def verify_caching():
    fl = FinanceLogic()
    db_mod.init_db()
    db = db_mod.SessionLocal()
    
    symbol = "TSLA"
    print(f"--- 1. Testing yfinance download for {symbol} ---")
    success = fl.download_and_save_data(db, symbol, period="1y")
    if not success:
        print("Download failed.")
        return

    # Create dummy tickers and columns
    tickers = [db_mod.Ticker(symbol=symbol, list_id=1)] # list_id dummy
    columns = [
        {'indicator_type': 'sma', 'parameters': json.dumps({'length': 20}), 'timeframe': 'D'},
        {'indicator_type': 'rsi', 'parameters': json.dumps({'length': 14}), 'timeframe': 'D'},
        {'indicator_type': 'ema', 'parameters': json.dumps({'length': 50}), 'timeframe': 'W'}
    ]

    print(f"\n--- 2. Running First Screening (Should Calculate and Cache) ---")
    start = datetime.now()
    results1 = fl.run_dynamic_screening(db, tickers, columns)
    duration1 = datetime.now() - start
    print(f"Duration: {duration1}")
    
    # Check if values are in DB
    cached_count = db.query(db_mod.ScreeningValue).filter(db_mod.ScreeningValue.symbol == symbol).count()
    print(f"Cached entries in DB: {cached_count}")

    print(f"\n--- 3. Running Second Screening (Should Use Cache) ---")
    start = datetime.now()
    results2 = fl.run_dynamic_screening(db, tickers, columns)
    duration2 = datetime.now() - start
    print(f"Duration: {duration2}")
    
    if duration2 < duration1:
        print(f"SUCCESS: Cache is faster! ({duration2} vs {duration1})")
    else:
        print(f"WARNING: Cache not significantly faster? ({duration2} vs {duration1})")

    print(f"\n--- 4. Testing Orphan Detection ---")
    # Orphans should be 0 because we just ran screening with these columns
    # But wait, run_dynamic_screening doesn't "register" active columns globally, 
    # it just uses passed ones. get_orphan_indicators checks against ScreeningColumn table.
    
    # Let's add an active column to the DB to avoid flagging everything as orphan
    active_col = db_mod.ScreeningColumn(
        sheet_id=1,
        indicator_type='sma',
        parameters=json.dumps({'length': 20}),
        timeframe='D',
        color='#ffffff'
    )
    db.add(active_col)
    db.commit()
    
    orphans = fl.get_orphan_indicators(db)
    print(f"Orphan indicators found: {len(orphans)}")
    for o in orphans[:5]:
        print(f" - {o['indicator_key']} ({o['count']} entries)")

    print(f"\n--- 5. Testing Orphan Deletion ---")
    if orphans:
        key_to_del = orphans[0]['indicator_key']
        print(f"Deleting orphans for key: {key_to_del}")
        fl.delete_orphans(db, [key_to_del])
        
        post_del_count = db.query(db_mod.ScreeningValue).filter(db_mod.ScreeningValue.indicator_key == key_to_del).count()
        print(f"Post-deletion count for {key_to_del}: {post_del_count}")
        if post_del_count == 0:
            print("SUCCESS: Orphan deleted.")
        else:
            print("FAILURE: Orphan still exists.")

    db.close()

if __name__ == "__main__":
    verify_caching()
