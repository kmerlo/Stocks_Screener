from finance_logic import finance_logic
import database as db_mod
from sqlalchemy.orm import Session
import os

def test_logic():
    # Ensure DB is initialized
    db_mod.init_db()
    db = db_mod.SessionLocal()
    
    symbol = "AAPL"
    print(f"Testing yfinance download for {symbol}...")
    import yfinance as yf
    test_df = yf.download(symbol, period="5d", auto_adjust=False)
    print("Columns:", test_df.columns)
    print("Index name:", test_df.index.name)
    print("First few rows:\n", test_df.head())
    
    success = finance_logic.download_and_save_data(db, symbol, period="1mo")
    
    if success:
        print("Download successful!")
        data = db.query(db_mod.PriceData).filter(db_mod.PriceData.symbol == symbol).all()
        print(f"Stored {len(data)} records for {symbol}.")
        
        print("Testing MA Slope calculation...")
        close, slope, status = finance_logic.calculate_ma_slope(symbol, db, window=5)
        print(f"Result: Close={close}, Slope={slope}, Status={status}")
    else:
        print("Download failed.")
    
    db.close()

if __name__ == "__main__":
    test_logic()
