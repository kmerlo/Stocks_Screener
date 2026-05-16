import yfinance as yf
import pandas as pd
import pandas_ta_classic as ta
from pytickersymbols import PyTickerSymbols
from sqlalchemy import func
from sqlalchemy.orm import Session
from database import PriceData as DBPriceData, init_db, ScreeningValue, ScreeningColumn, Alarm, Drawing, FundamentalData
from datetime import datetime, timedelta
import io
import json
import concurrent.futures
from functools import partial
import os

class FinanceLogic:
    def __init__(self):
        self.stock_data = PyTickerSymbols()

    def get_indices(self):
        return sorted(list(self.stock_data.get_all_indices()))

    def get_tickers_by_index(self, index_name):
        stocks = self.stock_data.get_stocks_by_index(index_name)
        tickers = []
        for s in stocks:
            name = s.get('name')
            # Extract symbols - pytickersymbols structure can be nested
            symbols = s.get('symbols', [])
            yahoo_symbol = None
            for sym_entry in symbols:
                if 'yahoo' in sym_entry:
                    yahoo_symbol = sym_entry['yahoo']
                    break
            
            symbol = None
            if yahoo_symbol:
                symbol = yahoo_symbol
            elif s.get('symbol'):
                symbol = s.get('symbol')
            
            if symbol:
                tickers.append({"symbol": symbol, "name": name})
        return tickers


    def download_and_save_data(self, db: Session, symbol: str, period: str = "1y"):
        """Downloads data from yfinance and saves to DB. Incremental approach if data exists."""
        # Check for latest date in DB to perform incremental update
        last_entry = db.query(DBPriceData).filter(DBPriceData.symbol == symbol).order_by(DBPriceData.date.desc()).first()
        
        if last_entry:
            # Use the date of the last entry as start date (inclusive) to re-fetch that day's data.
            # This ensures that if the previous update occurred before market close, the full day's candle
            # (including the correct closing price) will be retrieved and will overwrite the incomplete record.
            start_date = last_entry.date.date()
            print(f"DEBUG: Performing incremental update for {symbol} starting from {start_date} (Last DB entry: {last_entry.date.date()})")
            print(f"DEBUG: yf.download(symbol='{symbol}', start='{start_date}', auto_adjust=False, repair=True)")
            df = yf.download(symbol, start=start_date, auto_adjust=False, repair=True)
        else:
            print(f"DEBUG: Performing initial download for {symbol} using period='{period}'")
            print(f"DEBUG: yf.download(symbol='{symbol}', period='{period}', auto_adjust=False, repair=True)")
            df = yf.download(symbol, period=period, auto_adjust=False, repair=True)
        
        if df.empty:
            print(f"No new data downloaded for {symbol}")
            self.check_alarms(db, symbol)
            return False

        print(f"Successfully downloaded {len(df)} candles for {symbol}")
        success = self._process_yf_df(db, symbol, df)
        # Always check alarms to populate initial last_checked_price even if no new data was added
        self.check_alarms(db, symbol)
        return success

    def extend_history(self, db: Session, symbol: str, years: int) -> bool:
        """Fetches data older than the oldest record in the DB."""
        # Find the oldest date in DB for this ticker
        oldest_entry = db.query(DBPriceData).filter(DBPriceData.symbol == symbol).order_by(DBPriceData.date.asc()).first()
        
        if not oldest_entry:
            # If no data exists, just do a normal download for the specified years
            return self.download_and_save_data(db, symbol, period=f"{years}y")

        end_date = oldest_entry.date
        start_date = end_date - timedelta(days=365 * years)
        
        print(f"DEBUG: yf.download(symbol='{symbol}', start='{start_date.date()}', end='{end_date.date()}', auto_adjust=False, repair=True)")
        df = yf.download(symbol, start=start_date, end=end_date, auto_adjust=False, repair=True)
        
        if df.empty:
            print(f"No older data found for {symbol} before {end_date.date()}")
            return False
            
        print(f"Successfully downloaded {len(df)} older candles for {symbol}")
        return self._process_yf_df(db, symbol, df)

    def _process_yf_df(self, db: Session, symbol: str, df: pd.DataFrame):
        """Processes the yfinance DataFrame and saves unique or updated records to the DB."""
        # If yfinance returns multi-index columns (happens in recent versions), flatten them
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)

        # Reset index to get Date as a column
        df = df.reset_index()
        
        # Ensure 'Date' column is present
        if 'Date' not in df.columns:
            # Sometimes it might be named differently
            df = df.rename(columns={df.columns[0]: 'Date'})

        print(f"DEBUG: Processing {len(df)} rows for {symbol}...")
        for _, row in df.iterrows():
            # Convert pandas Timestamp to python datetime for SQLite compatibility
            raw_date = row['Date']
            if hasattr(raw_date, 'to_pydatetime'):
                date_val = raw_date.to_pydatetime()
            elif isinstance(raw_date, str):
                date_val = datetime.fromisoformat(raw_date.replace('Z', '+00:00'))
            else:
                date_val = raw_date
            
            # Remove timezone info if present, SQLite works better with naive datetimes
            if hasattr(date_val, 'tzinfo') and date_val.tzinfo is not None:
                date_val = date_val.replace(tzinfo=None)

            # Ensure we are working with just the date part for comparison in some cases
            # Often yf daily bars are 00:00:00
            
            # Check if record already exists
            existing = db.query(DBPriceData).filter(
                DBPriceData.symbol == symbol,
                DBPriceData.date == date_val
            ).first()
            
            try:
                if existing:
                    print(f"DEBUG: Updating existing record for {symbol} on {date_val.date()}")
                    existing.open = float(row['Open'])
                    existing.high = float(row['High'])
                    existing.low = float(row['Low'])
                    existing.close = float(row['Close'])
                    existing.adj_close = float(row['Adj Close'])
                    existing.volume = int(row['Volume'])
                else:
                    print(f"DEBUG: Creating NEW record for {symbol} on {date_val.date()}")
                    price_record = DBPriceData(
                        symbol=symbol,
                        date=date_val,
                        open=float(row['Open']),
                        high=float(row['High']),
                        low=float(row['Low']),
                        close=float(row['Close']),
                        adj_close=float(row['Adj Close']),
                        volume=int(row['Volume'])
                    )
                    db.add(price_record)
            except (KeyError, ValueError, TypeError) as e:
                print(f"DEBUG: Skip row due to error: {e}")
                continue
        
        db.commit()
        return True

    def calculate_ma_slope(self, symbol: str, db: Session, window: int = 20):
        """Calculates the slope of the moving average (20 periods)."""
        data = db.query(DBPriceData).filter(DBPriceData.symbol == symbol).order_by(DBPriceData.date.asc()).all()
        if len(data) < window + 1:
            return None, None, "insufficient_data"

        df = pd.DataFrame([{
            'Date': d.date,
            'Close': d.close
        } for d in data])
        
        df['MA'] = df['Close'].rolling(window=window).mean()
        
        # Current MA and Previous MA to determine slope
        current_ma = df['MA'].iloc[-1]
        prev_ma = df['MA'].iloc[-2]
        
        if pd.isna(current_ma) or pd.isna(prev_ma):
            return None, None, "insufficient_data"
            
        slope = current_ma - prev_ma
        status = "positive" if slope > 0 else "negative" if slope < 0 else "neutral"
        
        return float(df['Close'].iloc[-1]), float(slope), status

    def parse_csv_tickers(self, csv_content: str):
        """Parses a CSV string with semicolon separator to extract tickers.
        Format: yahoo_ticker;name
        """
        try:
            import csv
            f = io.StringIO(csv_content.strip())
            # Try to detect if there's a header
            first_line = csv_content.strip().split('\n')[0].lower()
            has_header = "yahoo_ticker" in first_line or "ticker" in first_line
            
            reader = csv.reader(f, delimiter=';')
            if has_header:
                next(reader) # Skip header
                
            tickers = []
            for row in reader:
                if not row: continue
                symbol = row[0].strip()
                name = row[1].strip() if len(row) > 1 else None
                if symbol:
                    tickers.append({"symbol": symbol, "name": name})
            return tickers
        except Exception as e:
            print(f"Error parsing CSV: {e}")
            raise e
    def delete_ticker_data(self, db: Session, symbol: str):
        """Deletes all price records for a given symbol."""
        try:
            num_deleted = db.query(DBPriceData).filter(DBPriceData.symbol == symbol).delete()
            db.commit()
            print(f"Deleted {num_deleted} price records for {symbol}")
            return True, num_deleted
        except Exception as e:
            db.rollback()
            print(f"Error deleting data for {symbol}: {e}")
            return False, 0

    def delete_data_from(self, db: Session, symbol: str, start_date: datetime):
        """Deletes price records for a symbol from a certain date onwards."""
        try:
            num_deleted = db.query(DBPriceData).filter(
                DBPriceData.symbol == symbol,
                DBPriceData.date >= start_date
            ).delete()
            db.commit()
            print(f"Deleted {num_deleted} price records for {symbol} from {start_date}")
            return True, num_deleted
        except Exception as e:
            db.rollback()
            print(f"Error deleting data for {symbol} from {start_date}: {e}")
            return False, 0

    def _prepare_df(self, data):
        """Helper to convert list of DBPriceData objects or dicts to a pandas DataFrame."""
        if not data:
            return None
        
        # If data is a list of objects, convert to list of dicts first
        if not isinstance(data[0], dict):
            records = [{
                'Date': d.date,
                'Open': float(d.open),
                'High': float(d.high),
                'Low': float(d.low),
                'Close': float(d.close),
                'Volume': int(d.volume)
            } for d in data]
        else:
            records = data

        df = pd.DataFrame(records)
        df['Date'] = pd.to_datetime(df['Date'])
        df.set_index('Date', inplace=True)
        df.sort_index(inplace=True)
        return df

    def calculate_indicators(self, db: Session, symbol: str, indicator_list: list):
        """Calculates indicators using pandas-ta-classic."""
        data = db.query(DBPriceData).filter(DBPriceData.symbol == symbol).order_by(DBPriceData.date.asc()).all()
        if not data:
            return {"dates": [], "indicators": {}}

        df = self._prepare_df(data)
        if df is None: return {"dates": [], "indicators": {}}
        
        # Determine the target timeframe from the first indicator (they should all be the same)
        # Or better, just handle each one individually if they differ (though usually they won't)
        # For simplicity, we assume the whole batch uses the same timeframe if specified.
        target_tf = "D"
        if indicator_list:
            target_tf = indicator_list[0].get('timeframe', 'D')

        if target_tf == 'W':
            df = df.resample('W-MON', label='left', closed='left').agg({
                'Open': 'first',
                'High': 'max',
                'Low': 'min',
                'Close': 'last',
                'Volume': 'sum'
            }).dropna()
        elif target_tf == 'M':
            df = df.resample('MS', label='left', closed='left').agg({
                'Open': 'first',
                'High': 'max',
                'Low': 'min',
                'Close': 'last',
                'Volume': 'sum'
            }).dropna()

        # results will contain timestamp and the values
        results = {
            "dates": df.index.strftime('%Y-%m-%d').tolist(),
            "indicators": {}
        }
        
        for ind in indicator_list:
            ind_type = ind.get('indicator_type', '').lower()
            params = ind.get('parameters', {})
            
            # If parameters is a JSON string, parse it
            if isinstance(params, str):
                try:
                    params = json.loads(params)
                except:
                    params = {}

            # Generate a unique key for this indicator/params combo
            param_str = "_".join([f"{k}{v}" for k, v in params.items()])
            key = f"{ind_type}_{param_str}".lower() if param_str else ind_type.lower()
            
            try:
                if ind_type == 'volume':
                    # Pseudo-indicator: just return the volume column
                    results["indicators"][key] = [int(x) if pd.notnull(x) else None for x in df['Volume'].tolist()]
                # Use pandas-ta accessor
                elif hasattr(df.ta, ind_type) or ind_type == 'bbp':
                    # Special case for %B which is part of bbands
                    calc_type = 'bbands' if ind_type == 'bbp' else ind_type
                    method = getattr(df.ta, calc_type)
                    res = method(**params)
                    if res is not None:
                        if isinstance(res, pd.Series):
                            results["indicators"][key] = [x if pd.notnull(x) else None for x in res.tolist()]
                        elif isinstance(res, pd.DataFrame):
                            for col in res.columns:
                                col_upper = col.upper()
                                # Filtering logic for multi-column indicators
                                if ind_type == 'bbands':
                                    if not any(x in col_upper for x in ['BBL', 'BBM', 'BBU']): continue
                                elif ind_type == 'bbp':
                                    if 'BBP' not in col_upper: continue
                                elif ind_type == 'stoch':
                                    if not any(x in col_upper for x in ['STOCHK', 'STOCHD']): continue
                                elif ind_type == 'donchian':
                                    if not any(x in col_upper for x in ['DCL', 'DCM', 'DCU']): continue
                                elif ind_type == 'supertrend':
                                    # SUPERT_ is the value, SUPERTd_ is direction
                                    if 'SUPERT_' not in col_upper: continue
                                
                                # For DataFrames, we use a combined key to help frontend match
                                combined_key = f"{key}_{col}".lower()
                                results["indicators"][combined_key] = [x if pd.notnull(x) else None for x in res[col].tolist()]
                else:
                    print(f"Indicator {ind_type} not found in pandas-ta")
            except Exception as e:
                print(f"Error calculating {ind_type}: {e}")

        return results

    def run_modular_screening(self, db: Session, tickers: list, roc_periods: list):
        """Runs modular screening using optimized caching and parallel processing."""
        # Convert ROC periods to common indicator columns for run_dynamic_screening
        cols = []
        for n in roc_periods:
            cols.append({
                'indicator_type': 'roc',
                'parameters': {'length': n},
                'timeframe': 'D'
            })
        
        # Call the generic dynamic screening which handles caching and DB storage
        results = self.run_dynamic_screening(db, tickers, cols)
        
        # Map the internal keys (roc_lengthN_D) back to the flat keys (roc_N) expected by frontend
        final_results = []
        for res in results:
            mapped_data = {}
            for n in roc_periods:
                key = f"roc_length{n}_D"
                mapped_data[f"roc_{n}"] = res["data"].get(key, 0.0)
            
            final_results.append({
                "symbol": res["symbol"],
                "last_date": res["last_date"],
                "last_price": res["last_price"],
                "data": mapped_data
            })
            
        return final_results

    def generate_indicator_key(self, ind_type: str, params: dict, timeframe: str):
        """Generates a unique key for a specific indicator configuration."""
        # Sort keys to ensure consistent hashing
        sorted_params = sorted(params.items())
        param_str = "_".join([f"{k}{v}" for k, v in sorted_params])
        return f"{ind_type.lower()}_{param_str}_{timeframe}".rstrip("_")

    @staticmethod
    def _resample_df(df: pd.DataFrame, timeframe: str):
        if timeframe == 'D' or df.empty:
            return df
        
        # Ensure index is datetime
        if not isinstance(df.index, pd.DatetimeIndex):
            df.index = pd.to_datetime(df.index)

        logic = {
            'Open': 'first',
            'High': 'max',
            'Low': 'min',
            'Close': 'last',
            'Volume': 'sum'
        }
        
        if timeframe == 'W':
            resampled = df.resample('W-MON').apply(logic)
        elif timeframe == 'M':
            resampled = df.resample('MS').apply(logic)
        else:
            return df
            
        return resampled.dropna()

    @staticmethod
    def _calculate_worker(ticker_symbol, records, columns):
        """Worker function for parallel indicator calculation. Returns full history for caching."""
        try:
            # We need to recreate the DF inside the worker
            base_df = pd.DataFrame(records)
            if base_df.empty:
                return None
            
            base_df['Date'] = pd.to_datetime(base_df['Date'])
            base_df.set_index('Date', inplace=True)
            base_df.sort_index(inplace=True)

            results = {
                "symbol": ticker_symbol,
                "last_date": base_df.index[-1].strftime('%Y-%m-%d'),
                "last_price": float(base_df['Close'].iloc[-1]),
                "data": {}
            }

            history_data = [] # List of (indicator_key, date, value)
            
            # Group columns by timeframe to avoid redundant resampling
            cols_by_tf = {}
            for ind in columns:
                tf = ind.get('timeframe', 'D')
                if tf not in cols_by_tf: cols_by_tf[tf] = []
                cols_by_tf[tf].append(ind)

            for tf, tf_columns in cols_by_tf.items():
                df = FinanceLogic._resample_df(base_df, tf)
                if df.empty: continue

                for ind in tf_columns:
                    ind_type = ind.get('indicator_type', '').lower()
                    params = ind.get('parameters', {})
                    if isinstance(params, str):
                        try: params = json.loads(params)
                        except: params = {}
                    
                    # Generate key
                    param_str = "_".join([f"{k}{v}" for k, v in sorted(params.items())])
                    base_key = f"{ind_type.lower()}_{param_str}_{tf}".rstrip("_")

                    try:
                        if ind_type == 'volume':
                            # Screening optimization: only save the LAST value for ScreeningValue
                            if not df.empty:
                                last_idx = df.index[-1]
                                last_val = float(df['Volume'].iloc[-1])
                                if pd.notnull(last_val):
                                    history_data.append((base_key, last_idx, last_val))
                            
                            if tf == 'D' and not df.empty: 
                                results["data"][base_key] = int(df['Volume'].iloc[-1])
                        elif hasattr(df.ta, ind_type) or ind_type == 'bbp':
                            calc_type = 'bbands' if ind_type == 'bbp' else ind_type
                            method = getattr(df.ta, calc_type)
                            res = method(**params)
                            if res is not None:
                                if isinstance(res, pd.Series):
                                    # Screening optimization: only save the LAST value for ScreeningValue
                                    if not res.empty:
                                        last_idx = res.index[-1]
                                        last_val = float(res.iloc[-1])
                                        if pd.notnull(last_val):
                                            history_data.append((base_key, last_idx, last_val))
                                    
                                    val = res.iloc[-1] if not res.empty else None
                                    results["data"][base_key] = float(val) if pd.notnull(val) else None

                                    # New requirement: distance % and days above/below for Moving Averages
                                    if ind_type in ['sma', 'ema', 'wma'] and not res.empty:
                                        # Calculate distance %
                                        dist_key = f"{base_key}_dist"
                                        price_series = df['Close']
                                        ma_series = res if isinstance(res, pd.Series) else res.iloc[:, 0]
                                        
                                        dist_val = (price_series.iloc[-1] / ma_series.iloc[-1] - 1) * 100
                                        results["data"][dist_key] = float(dist_val) if not pd.isna(dist_val) else None

                                        # Calculate consecutive days (periods) above or below
                                        days_key = f"{base_key}_days"
                                        # To calculate duration accurately, we still need the full series in the worker
                                        above = price_series > ma_series
                                        groups = above.diff().ne(0).cumsum()
                                        group_counts = above.groupby(groups).cumcount() + 1
                                        trend_duration_series = group_counts * (above.map({True: 1, False: -1}))
                                        last_days = float(trend_duration_series.iloc[-1]) if not pd.isna(trend_duration_series.iloc[-1]) else None
                                        results["data"][days_key] = last_days

                                        history_data.append((dist_key, df.index[-1], results["data"][dist_key]))
                                        history_data.append((days_key, df.index[-1], results["data"][days_key]))
                                elif ind_type == 'roc':
                                    length = params.get('length', 1)
                                    res = (df['Close'] / df['Close'].shift(length) - 1) * 100
                                    # Screening optimization: only save the LAST value for ScreeningValue
                                    if not res.empty:
                                        last_idx = res.index[-1]
                                        last_val = float(res.iloc[-1])
                                        if pd.notnull(last_val):
                                            history_data.append((base_key, last_idx, last_val))
                                    
                                    val = res.iloc[-1] if not res.empty else None
                                    results["data"][base_key] = float(val) if pd.notnull(val) else None
                                elif isinstance(res, pd.DataFrame):
                                    for col in res.columns:
                                        col_upper = col.upper()
                                        if ind_type == 'bbands' and not any(x in col_upper for x in ['BBL', 'BBM', 'BBU']): continue
                                        if ind_type == 'bbp' and 'BBP' not in col_upper: continue
                                        if ind_type == 'stoch' and not any(x in col_upper for x in ['STOCHK', 'STOCHD']): continue
                                        if ind_type == 'donchian' and not any(x in col_upper for x in ['DCL', 'DCM', 'DCU']): continue
                                        if ind_type == 'supertrend' and 'SUPERT_' not in col_upper: continue
                                        
                                        combined_key = f"{base_key}_{col}".lower()
                                        # Screening optimization: only save the LAST value
                                        if not res[col].empty:
                                            last_idx = res.index[-1]
                                            last_val = float(res[col].iloc[-1])
                                            if pd.notnull(last_val):
                                                history_data.append((combined_key, last_idx, last_val))
                                        
                                        val = res[col].iloc[-1] if not res[col].empty else None
                                        results["data"][combined_key] = float(val) if pd.notnull(val) else None
                    except Exception as e:
                        print(f"Worker Error calculating {ind_type} for {ticker_symbol}: {e}")

            return {"results": results, "history": history_data}
        except Exception as e:
            print(f"Critical Worker Error for {ticker_symbol}: {e}")
            return None

    def run_dynamic_screening(self, db: Session, tickers: list, columns: list):
        """Runs dynamic screening using caching and parallel processing."""
        symbols = [t.symbol if hasattr(t, 'symbol') else t for t in tickers]
        if not symbols: return []

        print(f"DEBUG: Starting optimized screening for {len(symbols)} tickers with {len(columns)} columns...")
        start_time = datetime.now()
        step_start = datetime.now()

        # Step 1: Identify which tickers/indicators need rcalculation
        # For simplicity, we check if the last price date matches the last cached date
        # We need to know which columns are requested
        active_keys = []
        for col in columns:
            timeframe = col.get('timeframe', 'D')
            params = col.get('parameters', {})
            if isinstance(params, str): params = json.loads(params)
            key = self.generate_indicator_key(col['indicator_type'], params, timeframe)
            active_keys.append(key)
            
            # For SMA/EMA/WMA, we also need to fetch the derived distance and days indicators
            if col['indicator_type'].lower() in ['sma', 'ema', 'wma']:
                active_keys.append(f"{key}_dist")
                active_keys.append(f"{key}_days")

        # Step 2: Batch fetch latest price info (date and price) per symbol
        latest_prices_sub = db.query(
            DBPriceData.symbol.label('s'),
            func.max(DBPriceData.date).label('max_d')
        ).filter(DBPriceData.symbol.in_(symbols)).group_by(DBPriceData.symbol).subquery()

        ticker_last_info = db.query(
            DBPriceData.symbol,
            DBPriceData.date,
            DBPriceData.close
        ).join(
            latest_prices_sub,
            (DBPriceData.symbol == latest_prices_sub.c.s) &
            (DBPriceData.date == latest_prices_sub.c.max_d)
        ).all()
        
        ticker_last_data = {row.symbol: {"date": row.date, "price": float(row.close)} for row in ticker_last_info}
        
        print(f"DEBUG: Step 1-2 (Metadata & Prices) took: {datetime.now() - step_start}")
        step_start = datetime.now()

        # Step 3: Fetch cached values for these symbols/keys
        latest_dates_sub = db.query(
            ScreeningValue.symbol.label('s'), 
            ScreeningValue.indicator_key.label('k'), 
            func.max(ScreeningValue.date).label('max_d')
        ).filter(
            ScreeningValue.symbol.in_(symbols),
            ScreeningValue.indicator_key.in_(active_keys)
        ).group_by(ScreeningValue.symbol, ScreeningValue.indicator_key).subquery()

        cached_data_query = db.query(
            ScreeningValue.symbol,
            ScreeningValue.indicator_key,
            ScreeningValue.date,
            ScreeningValue.value
        ).join(
            latest_dates_sub,
            (ScreeningValue.symbol == latest_dates_sub.c.s) &
            (ScreeningValue.indicator_key == latest_dates_sub.c.k) &
            (ScreeningValue.date == latest_dates_sub.c.max_d)
        ).all()

        cache_status = {} # (symbol, key) -> (latest_date, actual_value)
        for s, k, d, v in cached_data_query:
            cache_status[(s, k)] = (d, v)
        print(f"DEBUG: Step 3 (Fetch Cache Status) took: {datetime.now() - step_start}")
        step_start = datetime.now()

        # Check which symbols need FULL recalculation
        needs_calc = []
        already_cached_results = {} # symbol -> {res_obj}

        for s in symbols:
            s_needs_calc = False
            s_data = {}
            last_info = ticker_last_data.get(s)
            
            if not last_info:
                already_cached_results[s] = {
                    "symbol": s,
                    "last_date": "",
                    "last_price": 0.0,
                    "data": {}
                }
                continue

            last_price_date = last_info["date"]
            last_price_val = last_info["price"]

            for k in active_keys:
                cache_info = cache_status.get((s, k))
                if not cache_info or cache_info[0].date() < last_price_date.date():
                    s_needs_calc = True
                    break
                s_data[k] = cache_info[1]
            
            if s_needs_calc:
                needs_calc.append(s)
            else:
                already_cached_results[s] = {
                    "symbol": s,
                    "last_date": last_price_date.strftime('%Y-%m-%d'),
                    "last_price": last_price_val,
                    "data": s_data
                }
        print(f"DEBUG: Cache logic (needs_calc count: {len(needs_calc)}) took: {datetime.now() - step_start}")
        step_start = datetime.now()
        
        # Step 4: Parallel calculation for those that need it
        final_results = list(already_cached_results.values())
        
        t5_start = datetime.now()
        if needs_calc:
            # Optimization: Pre-fetch ALL existing dates for these symbols to avoid redundant inner queries
            existing_cache = {} # (symbol, key) -> set(date)
            # We fetch for symbols in needs_calc only
            existing_data = db.query(ScreeningValue.symbol, ScreeningValue.indicator_key, ScreeningValue.date).filter(
                ScreeningValue.symbol.in_(needs_calc),
                ScreeningValue.indicator_key.in_(active_keys)
            ).all()
            for s, k, d in existing_data:
                combo = (s, k)
                if combo not in existing_cache: existing_cache[combo] = set()
                existing_cache[combo].add(d)

            # Loading Optimization: Calculate max lookback required
            max_p = 200 # Default fallback
            for col in columns:
                params = col.get('parameters', {})
                if isinstance(params, str):
                    try: params = json.loads(params)
                    except: params = {}
                p_val = params.get('length') or params.get('period') or params.get('n') or params.get('window') or 0
                
                tf = col.get('timeframe', 'D')
                multiplier = 1
                if tf == 'W': multiplier = 5
                elif tf == 'M': multiplier = 21
                
                max_p = max(max_p, (int(p_val) + 100) * multiplier) # 100 bar buffer for warm-up
            
            # Fetch price data using a window function
            # Fetch only the last 'max_p' records for each ticker in needs_calc
            from sqlalchemy import select, desc
            print(f"DEBUG: Optimized fetch for {len(needs_calc)} tickers. Max lookback: {max_p} bars.")
            
            # Subquery to get top N records per symbol using ROW_NUMBER()
            subq = select(
                DBPriceData.symbol,
                DBPriceData.date,
                DBPriceData.open,
                DBPriceData.high,
                DBPriceData.low,
                DBPriceData.close,
                DBPriceData.volume,
                func.row_number().over(
                    partition_by=DBPriceData.symbol,
                    order_by=desc(DBPriceData.date)
                ).label("rn")
            ).where(DBPriceData.symbol.in_(needs_calc)).subquery()
            
            stmt = select(
                subq.c.symbol, subq.c.date, subq.c.open, subq.c.high, subq.c.low, subq.c.close, subq.c.volume
            ).where(subq.c.rn <= max_p).order_by(subq.c.symbol, subq.c.date.asc())
            
            calc_data_raw = db.execute(stmt).fetchall()
            
            ticker_records = {}
            for row in calc_data_raw:
                if row.symbol not in ticker_records: ticker_records[row.symbol] = []
                ticker_records[row.symbol].append({
                    'Date': row.date, 
                    'Open': float(row.open), 'High': float(row.high), 'Low': float(row.low), 'Close': float(row.close), 'Volume': int(row.volume)
                })

            max_workers = min(os.cpu_count() or 4, len(needs_calc))
            with concurrent.futures.ProcessPoolExecutor(max_workers=max_workers) as executor:
                futures = [
                    executor.submit(self._calculate_worker, s, ticker_records.get(s, []), columns)
                    for s in needs_calc
                ]
                
                all_to_add = []
                for future in concurrent.futures.as_completed(futures):
                    res_dict = future.result()
                    if res_dict:
                        worker_res = res_dict["results"]
                        history = res_dict["history"]
                        final_results.append(worker_res)
                        
                        sym = worker_res["symbol"]
                        for key, date, val in history:
                            # Use pre-fetched existing_cache
                            if date not in existing_cache.get((sym, key), set()):
                                all_to_add.append(ScreeningValue(
                                    symbol=sym,
                                    indicator_key=key,
                                    date=date,
                                    value=val
                                ))
                
                if all_to_add:
                    try:
                        print(f"DEBUG: Saving {len(all_to_add)} new records to DB...")
                        db.bulk_save_objects(all_to_add)
                        db.commit()
                    except Exception as e:
                        print(f"Error saving screening values: {e}")
                        db.rollback()
                
        print(f"DEBUG: Step 4-5 (Calculation & Save) took: {datetime.now() - step_start}")
        print(f"DEBUG: Screening complete. Total time: {datetime.now() - start_time}")
        return final_results

    def get_orphan_indicators(self, db: Session):
        """Identifies indicator keys present in ScreeningValue but not in any ScreeningColumn."""
        all_cached_keys = db.query(ScreeningValue.indicator_key).distinct().all()
        all_cached_keys = [k[0] for k in all_cached_keys]

        active_columns = db.query(ScreeningColumn).all()
        active_keys = set()
        for col in active_columns:
            params = json.loads(col.parameters) if isinstance(col.parameters, str) else col.parameters
            # We need to handle potential multi-column results (bbands -> BBL, BBM, BBU)
            # This logic is slightly duplicated from the calculation loop.
            base_key = self.generate_indicator_key(col.indicator_type, params, col.timeframe)
            active_keys.add(base_key) 
            # Add common prefixes for multi-column ones
            if col.indicator_type.lower() in ['bbands', 'stoch', 'donchian', 'supertrend']:
                # The keys in DB look like "bbands_period20_D_BBL"
                # So we check if cached_key STARTS WITH base_key
                pass # Handled below

        orphans = []
        for k in all_cached_keys:
            is_active = False
            for ak in active_keys:
                if k == ak or k.startswith(ak + "_"):
                    is_active = True
                    break
            if not is_active:
                count = db.query(ScreeningValue).filter(ScreeningValue.indicator_key == k).count()
                orphans.append({"indicator_key": k, "count": count})
        
        return orphans

    def delete_all_prices(self, db: Session):
        """Deletes ALL records from the PriceData table."""
        try:
            num_deleted = db.query(DBPriceData).delete()
            db.commit()
            print(f"Deleted ALL price records ({num_deleted})")
            return True, num_deleted
        except Exception as e:
            db.rollback()
            print(f"Error deleting all prices: {e}")
            return False, 0

    def vacuum_database(self, db: Session):
        """Executes VACUUM command to optimize the SQLite file size."""
        try:
            # SQLite VACUUM cannot be run inside a transaction.
            conn = db.get_bind().raw_connection()
            cursor = conn.cursor()
            cursor.execute("VACUUM")
            cursor.close()
            conn.close()
            print("Database VACUUM completed successfully.")
            return True
        except Exception as e:
            print(f"Error during VACUUM: {e}")
            return False

    def check_alarms(self, db: Session, symbol: str):
        """Checks if any active alarms for the symbol have been triggered by the latest price data."""
        active_alarms = db.query(Alarm).join(Drawing).filter(
            Drawing.symbol == symbol,
            Alarm.is_active == 1,
            Alarm.triggered_at == None
        ).all()

        if not active_alarms:
            return

        # Get last two candles
        candles = db.query(DBPriceData).filter(DBPriceData.symbol == symbol).order_by(DBPriceData.date.desc()).limit(2).all()
        if not candles:
            return

        current = candles[0]
        # If we only have one candle, we use it for both previous and current to detect "touch"
        previous = candles[1] if len(candles) > 1 else current

        for alarm in active_alarms:
            dr = alarm.drawing
            try:
                points = json.loads(dr.points)
            except:
                continue
            
            if not points:
                continue

            triggered = False
            trigger_price = None

            if dr.type == 'horizontal_line':
                level = points[0]['price']
                if alarm.trigger_type == 'close':
                    if (previous.close < level and current.close >= level) or \
                       (previous.close > level and current.close <= level):
                        triggered = True
                        trigger_price = current.close
                else: # intraday
                    if (previous.close <= level and current.high >= level) or \
                       (previous.close >= level and current.low <= level):
                        triggered = True
                        trigger_price = level

            elif dr.type in ['trend_line', 'ray', 'extended_line'] and len(points) >= 2:
                # Trend line logic: Linear interpolation/extrapolation
                p1 = points[0]
                p2 = points[1]
                
                try:
                    # Convert JS ISO strings or similar to datetime
                    t1 = pd.to_datetime(p1['time']).timestamp()
                    t2 = pd.to_datetime(p2['time']).timestamp()
                    v1 = p1['price']
                    v2 = p2['price']
                    curr_t = current.date.timestamp()
                    prev_t = previous.date.timestamp()

                    if t2 != t1:
                        # Intercept at current time
                        level_curr = v1 + (v2 - v1) * (curr_t - t1) / (t2 - t1)
                        # Intercept at previous time
                        level_prev = v1 + (v2 - v1) * (prev_t - t1) / (t2 - t1)

                        if alarm.trigger_type == 'close':
                            if (previous.close < level_prev and current.close >= level_curr) or \
                               (previous.close > level_prev and current.close <= level_curr):
                                triggered = True
                                trigger_price = current.close
                        else: # intraday
                            if (previous.close <= level_prev and current.high >= level_curr) or \
                               (previous.close >= level_prev and current.low <= level_curr):
                                triggered = True
                                trigger_price = level_curr
                except Exception as e:
                    print(f"Error calculating trend line alarm for {symbol}: {e}")

            # Always record the last checked price to give user feedback
            alarm.last_checked_price = current.close

            if triggered:
                alarm.triggered_at = datetime.now()
                print(f"ALARM TRIGGERED: {symbol} at {trigger_price} (Type: {dr.type})")
        
        db.commit()

    def update_fundamental_data(self, db: Session, symbol: str):
        """Fetches fundamental data from yfinance and updates the DB."""
        try:
            ticker = yf.Ticker(symbol)
            info = ticker.info
            if not info:
                return None

            # Check if record already exists
            db_fund = db.query(FundamentalData).filter(FundamentalData.symbol == symbol).first()
            
            div_yield_raw = info.get("dividendYield")
            div_yield = float(div_yield_raw) / 100.0 if div_yield_raw is not None else None

            # Map info to FundamentalData fields
            fund_args = {
                "symbol": symbol,
                "market_cap": info.get("marketCap"),
                "pe_ratio": info.get("trailingPE"),
                "forward_pe": info.get("forwardPE"),
                "ps_ratio": info.get("priceToSalesTrailing12Months"),
                "pb_ratio": info.get("priceToBook"),
                "dividend_yield": div_yield,
                "beta": info.get("beta"),
                "total_revenue": info.get("totalRevenue"),
                "revenue_growth": info.get("revenueGrowth"),
                "gross_margins": info.get("grossMargins"),
                "ebitda_margins": info.get("ebitdaMargins"),
                "operating_margins": info.get("operatingMargins"),
                "profit_margins": info.get("profitMargins"),
                "total_cash": info.get("totalCash"),
                "total_debt": info.get("totalDebt"),
                "current_ratio": info.get("currentRatio"),
                "sector": info.get("sector"),
                "industry": info.get("industry"),
                "long_business_summary": info.get("longBusinessSummary"),
                "raw_info": json.dumps(info)
            }

            if db_fund:
                for key, value in fund_args.items():
                    setattr(db_fund, key, value)
                db_fund.last_updated = datetime.now()
            else:
                db_fund = FundamentalData(**fund_args)
                db.add(db_fund)
            
            db.commit()
            db.refresh(db_fund)
            return db_fund
        except Exception as e:
            db.rollback()
            print(f"Error updating fundamental data for {symbol}: {e}")
            return None

    def update_list_fundamentals(self, db: Session, tickers: list):
        """Batch updates fundamental data for a list of tickers."""
        results = []
        # Use concurrent.futures to speed up the process
        max_workers = min(os.cpu_count() or 4, len(tickers))
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            # We need to use a separate session for each thread or handle it carefully.
            # For simplicity and given SQLAlchemy Session concurrency constraints, 
            # we'll do them sequentially but within the method.
            # Actually yfinance is IO bound, so threads are fine, but DB session is not thread safe.
            # Let's do a simple loop for now to avoid session issues, or use many sessions.
            for t in tickers:
                symbol = t.symbol if hasattr(t, 'symbol') else t
                fund = self.update_fundamental_data(db, symbol)
                if fund:
                    results.append(fund)
        return results

    def get_fundamental_data(self, db: Session, symbol: str):
        """Retrieves stored fundamental data for a symbol."""
        return db.query(FundamentalData).filter(FundamentalData.symbol == symbol).first()

finance_logic = FinanceLogic()
