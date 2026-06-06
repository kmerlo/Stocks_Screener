from fastapi import FastAPI, Depends, HTTPException, Query, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, FileResponse, StreamingResponse
from sqlalchemy.orm import Session
import database as db_mod
import schemas
from finance_logic import finance_logic
from typing import List, Optional
import os
import json
import logging
import traceback
import io
import csv
from datetime import datetime

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from contextlib import asynccontextmanager
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

def _compute_dividend_cash_delta(price: float, quantity: float, exchange_rate: float, tax_rate: float) -> float:
    """
    Compute the cash impact (signed) of a DIVIDEND transaction in the portfolio's base currency.
    Sign of `quantity` determines direction (|quantity| = number of shares):
      - quantity > 0  => LONG side: receive dividend  (cash += gross_base - tax_base)
      - quantity < 0  => SHORT side: pay dividend    (cash -= gross_base + tax_base)
    `price` is dividend per share in instrument currency (always positive).
    """
    shares = abs(quantity)
    is_short = quantity < 0
    gross_base = price * shares * exchange_rate
    tax_base = gross_base * (tax_rate / 100.0) if tax_rate else 0.0
    if is_short:
        return -(gross_base + tax_base)
    else:
        return gross_base - tax_base

def _reverse_dividend_cash_delta(price: float, quantity: float, exchange_rate: float, tax_rate: float) -> float:
    """Return the negation of _compute_dividend_cash_delta for cash reversal."""
    return -_compute_dividend_cash_delta(price, quantity, exchange_rate, tax_rate)

def init_system_sheets():
    db = db_mod.SessionLocal()
    try:
        if not db.query(db_mod.ScreeningSheet).filter(db_mod.ScreeningSheet.name == "base").first():
            db.add(db_mod.ScreeningSheet(name="base"))
        if not db.query(db_mod.ScreeningSheet).filter(db_mod.ScreeningSheet.name == "roc").first():
            db.add(db_mod.ScreeningSheet(name="roc"))
        db.commit()
    finally:
        db.close()

@asynccontextmanager
async def lifespan(app: FastAPI):
    db_mod.init_db()
    init_system_sheets()
    yield

app = FastAPI(title="Financial Screener API", lifespan=lifespan)

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    logger.error(f"Validation error: {exc}")
    # Return a more readable error structure
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors()}
    )

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.error(f"Global error: {exc}")
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)}
    )

# Dependency to get DB session
def get_db():
    db = db_mod.SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- Ticker List Endpoints ---

@app.post("/lists/", response_model=schemas.TickerList)
def create_list(list_data: schemas.TickerListCreate, db: Session = Depends(get_db)):
    try:
        logger.info(f"Creating list with name: {list_data.name}")
        db_list = db_mod.TickerList(name=list_data.name)
        db.add(db_list)
        db.commit()
        db.refresh(db_list)
        logger.info(f"Successfully created list with ID: {db_list.id}")
        return db_list
    except Exception as e:
        logger.error(f"Error in create_list: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

# --- Ticker Mapping Management ---

@app.get("/tickers/mapping/", response_model=List[schemas.TickerMapping])
def get_ticker_mappings(db: Session = Depends(get_db)):
    return db.query(db_mod.TickerMapping).all()

@app.post("/tickers/mapping/", response_model=schemas.TickerMapping)
def create_ticker_mapping(mapping: schemas.TickerMappingCreate, db: Session = Depends(get_db)):
    try:
        existing = db.query(db_mod.TickerMapping).filter(db_mod.TickerMapping.symbol_yahoo == mapping.symbol_yahoo).first()
        if existing:
            existing.symbol_investing = mapping.symbol_investing
            existing.name = mapping.name
            db.commit()
            db.refresh(existing)
            return existing
        else:
            db_mapping = db_mod.TickerMapping(
                symbol_yahoo=mapping.symbol_yahoo,
                symbol_investing=mapping.symbol_investing,
                name=mapping.name
            )
            db.add(db_mapping)
            db.commit()
            db.refresh(db_mapping)
            return db_mapping
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating/updateing ticker mapping: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/tickers/mapping/{mapping_id}")
def delete_ticker_mapping(mapping_id: int, db: Session = Depends(get_db)):
    db_mapping = db.query(db_mod.TickerMapping).filter(db_mod.TickerMapping.id == mapping_id).first()
    if not db_mapping:
        raise HTTPException(status_code=404, detail="Mapping non trovato")
    db.delete(db_mapping)
    db.commit()
    return {"message": "Mapping eliminato con successo"}

@app.post("/tickers/mapping/import/")
async def import_ticker_mappings(file: UploadFile = File(...), db: Session = Depends(get_db)):
    try:
        content = await file.read()
        try:
            decoded_content = content.decode("utf-8")
        except UnicodeDecodeError:
            decoded_content = content.decode("latin-1")
            
        f = io.StringIO(decoded_content.strip())
        reader = csv.reader(f, delimiter=';')
        
        # Skip header if it exists
        first_row = next(reader, None)
        if first_row and ("yahoo" in first_row[0].lower() or "ticker" in first_row[0].lower()):
            pass # Skip
        elif first_row:
            # Re-process first row if it's not a header
            f.seek(0)
            reader = csv.reader(f, delimiter=';')

        upserted_count = 0
        for row in reader:
            if not row or len(row) < 2:
                continue
            
            symbol_yahoo = row[0].strip()
            symbol_investing = row[1].strip()
            name = row[2].strip() if len(row) > 2 else None
            
            if not symbol_yahoo or not symbol_investing:
                continue
                
            existing = db.query(db_mod.TickerMapping).filter(db_mod.TickerMapping.symbol_yahoo == symbol_yahoo).first()
            if existing:
                existing.symbol_investing = symbol_investing
                existing.name = name
            else:
                new_mapping = db_mod.TickerMapping(
                    symbol_yahoo=symbol_yahoo,
                    symbol_investing=symbol_investing,
                    name=name
                )
                db.add(new_mapping)
            upserted_count += 1
            
        db.commit()
        return {"message": f"Successfully upserted {upserted_count} mappings."}
    except Exception as e:
        db.rollback()
        logger.error(f"Error importing ticker mappings: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/tickers/mapping/export/")
def export_ticker_mappings(db: Session = Depends(get_db)):
    mappings = db.query(db_mod.TickerMapping).all()
    
    output = io.StringIO()
    writer = csv.writer(output, delimiter=';')
    writer.writerow(["Symbol Yahoo", "Symbol Investing", "Name"])
    
    for m in mappings:
        writer.writerow([m.symbol_yahoo, m.symbol_investing, m.name or ""])
    
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=ticker_mappings.csv"}
    )

@app.get("/lists/", response_model=List[schemas.TickerList])
def get_lists(db: Session = Depends(get_db)):
    return db.query(db_mod.TickerList).all()

@app.delete("/lists/{list_id}")
def delete_list(list_id: int, db: Session = Depends(get_db)):
    try:
        logger.info(f"Attempting to delete list ID: {list_id}")
        db_list = db.query(db_mod.TickerList).filter(db_mod.TickerList.id == list_id).first()
        if not db_list:
            logger.warning(f"List ID {list_id} not found for deletion.")
            raise HTTPException(status_code=404, detail="List not found")
        
        list_name = db_list.name
        db.delete(db_list)
        db.commit()
        logger.info(f"Successfully deleted list: {list_name}")
        return {"message": f"List '{list_name}' deleted"}
    except Exception as e:
        logger.error(f"Error in delete_list: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/lists/{list_id}/tickers/", response_model=schemas.Ticker)
def add_ticker_to_list(list_id: int, ticker: schemas.TickerCreate, db: Session = Depends(get_db)):
    import yfinance as yf

    db_list = db.query(db_mod.TickerList).filter(db_mod.TickerList.id == list_id).first()
    if not db_list:
        raise HTTPException(status_code=404, detail="List not found")

    symbol = ticker.symbol.upper().strip()

    # Check if ticker already in list
    existing = db.query(db_mod.Ticker).filter(db_mod.Ticker.list_id == list_id, db_mod.Ticker.symbol == symbol).first()
    if existing:
        return existing

    # Validate ticker via yfinance and fetch company name
    try:
        yf_ticker = yf.Ticker(symbol)
        info = yf_ticker.info
        # yfinance returns an empty dict or dict without quoteType for invalid symbols
        if not info or not info.get("quoteType"):
            raise HTTPException(status_code=404, detail=f"Ticker '{symbol}' non trovato. Verifica il simbolo e riprova.")
        company_name = info.get("shortName") or info.get("longName") or ticker.name
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Errore nella validazione del ticker '{symbol}': {str(e)}")

    db_ticker = db_mod.Ticker(symbol=symbol, name=company_name, list_id=list_id)
    db.add(db_ticker)
    db.commit()
    db.refresh(db_ticker)
    return db_ticker

@app.delete("/lists/{list_id}/tickers/{symbol}")
def remove_ticker_from_list(list_id: int, symbol: str, db: Session = Depends(get_db)):
    db_ticker = db.query(db_mod.Ticker).filter(db_mod.Ticker.list_id == list_id, db_mod.Ticker.symbol == symbol).first()
    if not db_ticker:
        raise HTTPException(status_code=404, detail="Ticker not found in list")
    db.delete(db_ticker)
    db.commit()
    return {"message": "Ticker removed"}

@app.delete("/lists/{list_id}/clear-tickers")
def clear_list_tickers(list_id: int, db: Session = Depends(get_db)):
    logger.info(f"Clearing all tickers from list ID: {list_id}")
    db_list = db.query(db_mod.TickerList).filter(db_mod.TickerList.id == list_id).first()
    if not db_list:
        logger.warning(f"List ID {list_id} not found for clearing.")
        raise HTTPException(status_code=404, detail="List not found")
    
    deleted_count = db.query(db_mod.Ticker).filter(db_mod.Ticker.list_id == list_id).delete()
    db.commit()
    logger.info(f"Successfully removed {deleted_count} tickers from list {db_list.name}")
    return {"message": f"All tickers ({deleted_count}) removed from list"}

@app.post("/lists/{list_id}/fetch-names")
def fetch_missing_ticker_names(list_id: int, db: Session = Depends(get_db)):
    import yfinance as yf
    
    logger.info(f"Fetching missing names for list ID: {list_id}")
    db_list = db.query(db_mod.TickerList).filter(db_mod.TickerList.id == list_id).first()
    if not db_list:
        raise HTTPException(status_code=404, detail="List not found")
        
    tickers_missing_name = db.query(db_mod.Ticker).filter(
        db_mod.Ticker.list_id == list_id,
        (db_mod.Ticker.name == None) | (db_mod.Ticker.name == "")
    ).all()
    
    if not tickers_missing_name:
        return {"message": "Nessun ticker trovato senza nome in questa lista.", "updated_count": 0}
        
    updated_count = 0
    for db_ticker in tickers_missing_name:
        try:
            yf_ticker = yf.Ticker(db_ticker.symbol)
            info = yf_ticker.info
            if info and info.get("quoteType"):
                company_name = info.get("shortName") or info.get("longName")
                if company_name:
                    db_ticker.name = company_name
                    updated_count += 1
        except Exception as e:
            logger.warning(f"Failed to fetch name for {db_ticker.symbol}: {e}")
            continue
            
    db.commit()
    return {"message": f"Nomi recuperati e aggiornati con successo per {updated_count} ticker.", "updated_count": updated_count}

# --- Data & Analysis Endpoints ---

@app.get("/indices/")
def list_indices():
    return finance_logic.get_indices()

@app.post("/lists/{list_id}/import-index/{index_name}")
def import_index_tickers(list_id: int, index_name: str, db: Session = Depends(get_db)):
    try:
        ticker_data = finance_logic.get_tickers_by_index(index_name)
        added = []
        skipped = []
        for entry in ticker_data:
            symbol = entry["symbol"]
            name = entry["name"]
            existing = db.query(db_mod.Ticker).filter(db_mod.Ticker.list_id == list_id, db_mod.Ticker.symbol == symbol).first()
            if not existing:
                try:
                    db_ticker = db_mod.Ticker(symbol=symbol, name=name, list_id=list_id)
                    db.add(db_ticker)
                    db.flush()  # Catch constraint errors early
                    added.append(symbol)
                except Exception as e:
                    logger.warning(f"Skipping {symbol}: {e}")
                    db.rollback()
                    skipped.append(symbol)
            elif name and existing.name != name:
                existing.name = name
        db.commit()
        msg = f"Added {len(added)} tickers from {index_name}"
        if skipped:
            msg += f" ({len(skipped)} skipped)"
        return {"message": msg, "tickers": added}
    except Exception as e:
        logger.error(f"Error importing index {index_name}: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/lists/{list_id}/upload-csv/")
async def upload_csv(list_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    try:
        content = await file.read()
        logger.info(f"Uploading CSV for list {list_id}, content length: {len(content)}")
        
        try:
            decoded_content = content.decode("utf-8")
        except UnicodeDecodeError:
            logger.warning("UTF-8 decoding failed, trying latin-1")
            decoded_content = content.decode("latin-1")
            
        ticker_data = finance_logic.parse_csv_tickers(decoded_content)
        added = []
        for entry in ticker_data:
            symbol = entry["symbol"]
            name = entry["name"]
            existing = db.query(db_mod.Ticker).filter(db_mod.Ticker.list_id == list_id, db_mod.Ticker.symbol == symbol).first()
            if not existing:
                db_ticker = db_mod.Ticker(symbol=symbol, name=name, list_id=list_id)
                db.add(db_ticker)
                added.append(symbol)
            elif name and existing.name != name:
                existing.name = name
        db.commit()
        logger.info(f"Successfully added {len(added)} tickers to list {list_id}")
        return {"message": f"Added {len(added)} tickers from CSV", "tickers": added}
    except Exception as e:
        logger.error(f"Error in upload_csv: {e}")
        traceback.print_exc()
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Server error: {str(e)}")

@app.post("/tickers/{symbol}/update-data/")
def update_ticker_data(symbol: str, years: int = None, db: Session = Depends(get_db)):
    # Use the years parameter to set the period for yfinance
    period = f"{years}y" if years else "1y"
    success = finance_logic.download_and_save_data(db, symbol, period=period)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to download data")
    return {"message": f"Data updated for {symbol} ({period})"}

@app.post("/tickers/{symbol}/extend-history/{years}")
def extend_ticker_history(symbol: str, years: int, db: Session = Depends(get_db)):
    success = finance_logic.extend_history(db, symbol, years)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to extend history")
    return {"message": f"History extended by {years} years for {symbol}"}

@app.delete("/tickers/{symbol}/data/")
def delete_ticker_pricing_data(symbol: str, db: Session = Depends(get_db)):
    success, num_deleted = finance_logic.delete_ticker_data(db, symbol)
    if not success:
        raise HTTPException(status_code=400, detail=f"Failed to delete data for {symbol}")
    return {"message": f"Deleted {num_deleted} price records for {symbol}"}

@app.delete("/tickers/{symbol}/data-from/")
def delete_ticker_data_from(symbol: str, date: str, db: Session = Depends(get_db)):
    try:
        from datetime import datetime
        start_date = datetime.fromisoformat(date)
        success, num_deleted = finance_logic.delete_data_from(db, symbol, start_date)
        if not success:
            raise HTTPException(status_code=400, detail=f"Failed to delete data for {symbol}")
        return {"message": f"Deleted {num_deleted} price records for {symbol} from {date}"}
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use ISO format (YYYY-MM-DD)")

@app.get("/tickers/{symbol}/data/", response_model=List[schemas.PriceData])
def get_ticker_data(symbol: str, db: Session = Depends(get_db)):
    data = db.query(db_mod.PriceData).filter(db_mod.PriceData.symbol == symbol).order_by(db_mod.PriceData.date.asc()).all()
    return data

@app.post("/screening/run", response_model=List[schemas.ModularScreeningResult])
def run_modular_screening(request: schemas.ScreeningRequest, db: Session = Depends(get_db)):
    if request.symbols:
        tickers = request.symbols
    else:
        if request.list_id == 0:
            # Aggregate all tickers from all lists, deduplicating by symbol
            db_tickers = db.query(db_mod.Ticker).all()
            seen = set()
            tickers = []
            for t in db_tickers:
                if t.symbol not in seen:
                    seen.add(t.symbol)
                    tickers.append(t)
        else:
            tickers = db.query(db_mod.Ticker).filter(db_mod.Ticker.list_id == request.list_id).all()
    
    results = finance_logic.run_modular_screening(db, tickers, request.roc_periods)

    # Enrich results with company name from DB
    if request.symbols:
        db_tickers = db.query(db_mod.Ticker).filter(db_mod.Ticker.symbol.in_(request.symbols)).all()
    elif request.list_id == 0:
        db_tickers = db.query(db_mod.Ticker).all()
    else:
        db_tickers = db.query(db_mod.Ticker).filter(db_mod.Ticker.list_id == request.list_id).all()
    name_map = {t.symbol: t.name for t in db_tickers}
    for r in results:
        r["name"] = name_map.get(r["symbol"])
    return results

# --- Chart Indicators & Templates ---

@app.post("/indicators/{symbol}/calculate")
def calculate_indicators(symbol: str, request: List[schemas.IndicatorRequest], db: Session = Depends(get_db)):
    indicators = [ind.model_dump() for ind in request]
    return finance_logic.calculate_indicators(db, symbol, indicators)

@app.get("/templates/", response_model=List[schemas.ChartTemplate])
def get_templates(db: Session = Depends(get_db)):
    return db.query(db_mod.ChartTemplate).all()

@app.post("/templates/", response_model=schemas.ChartTemplate)
def create_template(template_data: schemas.ChartTemplateCreate, db: Session = Depends(get_db)):
    try:
        db_template = db_mod.ChartTemplate(name=template_data.name)
        db.add(db_template)
        db.commit()
        db.refresh(db_template)
        
        for ind in template_data.indicators:
            db_ind = db_mod.TemplateIndicator(
                template_id=db_template.id,
                indicator_type=ind.indicator_type,
                parameters=ind.parameters,
                pane_index=ind.pane_index,
                color=ind.color
            )
            db.add(db_ind)
        
        db.commit()
        db.refresh(db_template)
        return db_template
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/templates/{template_id}", response_model=schemas.ChartTemplate)
def update_template(template_id: int, template_data: schemas.ChartTemplateUpdate, db: Session = Depends(get_db)):
    try:
        db_template = db.query(db_mod.ChartTemplate).filter(db_mod.ChartTemplate.id == template_id).first()
        if not db_template:
            raise HTTPException(status_code=404, detail="Template not found")
        
        # Update template name
        db_template.name = template_data.name
        
        # Delete existing indicators
        db.query(db_mod.TemplateIndicator).filter(db_mod.TemplateIndicator.template_id == template_id).delete()
        
        # Add updated indicators
        for ind in template_data.indicators:
            db_ind = db_mod.TemplateIndicator(
                template_id=db_template.id,
                indicator_type=ind.indicator_type,
                parameters=ind.parameters,
                pane_index=ind.pane_index,
                color=ind.color
            )
            db.add(db_ind)
        
        db.commit()
        db.refresh(db_template)
        return db_template
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/templates/{template_id}")
def delete_template(template_id: int, db: Session = Depends(get_db)):
    db_template = db.query(db_mod.ChartTemplate).filter(db_mod.ChartTemplate.id == template_id).first()
    if not db_template:
        raise HTTPException(status_code=404, detail="Template not found")
    db.delete(db_template)
    db.commit()
    return {"message": "Template deleted"}

# --- Screening Sheets Endpoints ---

@app.get("/screening/sheets/", response_model=List[schemas.ScreeningSheet])
def get_screening_sheets(db: Session = Depends(get_db)):
    return db.query(db_mod.ScreeningSheet).all()

@app.post("/screening/sheets/", response_model=schemas.ScreeningSheet)
def create_screening_sheet(sheet_data: schemas.ScreeningSheetBase, db: Session = Depends(get_db)):
    try:
        db_sheet = db_mod.ScreeningSheet(name=sheet_data.name)
        db.add(db_sheet)
        db.commit()
        db.refresh(db_sheet)
        return db_sheet
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/screening/sheets/{sheet_id}")
def delete_screening_sheet(sheet_id: int, db: Session = Depends(get_db)):
    db_sheet = db.query(db_mod.ScreeningSheet).filter(db_mod.ScreeningSheet.id == sheet_id).first()
    if not db_sheet:
        raise HTTPException(status_code=404, detail="Sheet not found")
    db.delete(db_sheet)
    db.commit()
    return {"message": "Sheet deleted"}

@app.post("/screening/sheets/{sheet_id}/columns/", response_model=schemas.ScreeningColumn)
def add_screening_column(sheet_id: int, col_data: schemas.ScreeningColumnCreate, db: Session = Depends(get_db)):
    db_sheet = db.query(db_mod.ScreeningSheet).filter(db_mod.ScreeningSheet.id == sheet_id).first()
    if not db_sheet:
        raise HTTPException(status_code=404, detail="Sheet not found")
    
    db_col = db_mod.ScreeningColumn(
        sheet_id=sheet_id,
        indicator_type=col_data.indicator_type,
        parameters=col_data.parameters,
        timeframe=col_data.timeframe,
        color=col_data.color
    )
    db.add(db_col)
    db.commit()
    db.refresh(db_col)
    return db_col

@app.put("/screening/columns/{column_id}", response_model=schemas.ScreeningColumn)
def update_screening_column(column_id: int, col_data: schemas.ScreeningColumnCreate, db: Session = Depends(get_db)):
    db_col = db.query(db_mod.ScreeningColumn).filter(db_mod.ScreeningColumn.id == column_id).first()
    if not db_col:
        raise HTTPException(status_code=404, detail="Column not found")
    
    db_col.parameters = col_data.parameters
    db_col.timeframe = col_data.timeframe
    if col_data.color:
        db_col.color = col_data.color
        
    db.commit()
    db.refresh(db_col)
    return db_col

@app.delete("/screening/columns/{column_id}")
def delete_screening_column(column_id: int, db: Session = Depends(get_db)):
    db_col = db.query(db_mod.ScreeningColumn).filter(db_mod.ScreeningColumn.id == column_id).first()
    if not db_col:
        raise HTTPException(status_code=404, detail="Column not found")
    db.delete(db_col)
    db.commit()
    return {"message": "Column deleted"}

@app.post("/screening/run-dynamic", response_model=List[schemas.ModularScreeningResult])
def run_dynamic_screening(request: schemas.DynamicScreeningRequest, db: Session = Depends(get_db)):
    if request.symbols:
        tickers = request.symbols
    else:
        if request.list_id == 0:
            db_tickers = db.query(db_mod.Ticker).all()
            seen = set()
            tickers = []
            for t in db_tickers:
                if t.symbol not in seen:
                    seen.add(t.symbol)
                    tickers.append(t)
        else:
            tickers = db.query(db_mod.Ticker).filter(db_mod.Ticker.list_id == request.list_id).all()
            
    # request.columns is List[TemplateIndicatorBase]
    cols = [c.model_dump() for c in request.columns]
    results = finance_logic.run_dynamic_screening(db, tickers, cols)

    # Enrich results with company name from DB
    if request.symbols:
        db_tickers = db.query(db_mod.Ticker).filter(db_mod.Ticker.symbol.in_(request.symbols)).all()
    elif request.list_id == 0:
        db_tickers = db.query(db_mod.Ticker).all()
    else:
        db_tickers = db.query(db_mod.Ticker).filter(db_mod.Ticker.list_id == request.list_id).all()
    
    name_map = {t.symbol: t.name for t in db_tickers}
    for r in results:
        r["name"] = name_map.get(r["symbol"])
    return results

# --- Maintenance Endpoints ---

@app.get("/maintenance/orphans", response_model=List[schemas.OrphanIndicator])
def get_orphans(db: Session = Depends(get_db)):
    return finance_logic.get_orphan_indicators(db)

@app.post("/maintenance/delete-orphans")
def delete_orphans(request: schemas.DeleteOrphansRequest, db: Session = Depends(get_db)):
    success, count = finance_logic.delete_orphans(db, request.indicator_keys)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to delete orphans")
    return {"message": f"Deleted {count} orphan records"}

@app.post("/maintenance/clear-prices")
def clear_prices(db: Session = Depends(get_db)):
    success, count = finance_logic.delete_all_prices(db)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to clear prices")
    return {"message": f"Successfully deleted {count} price records"}

@app.post("/maintenance/vacuum")
def vacuum_db(db: Session = Depends(get_db)):
    success = finance_logic.vacuum_database(db)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to vacuum database")
    return {"message": "Database optimized successfully (VACUUM)"}

# --- Drawing & Alarm Endpoints ---

@app.get("/tickers/{symbol}/drawings/", response_model=List[schemas.Drawing])
def get_drawings(symbol: str, db: Session = Depends(get_db)):
    return db.query(db_mod.Drawing).filter(db_mod.Drawing.symbol == symbol).all()

@app.post("/tickers/{symbol}/drawings/sync")
def sync_drawings(symbol: str, drawings_data: List[schemas.DrawingSync], db: Session = Depends(get_db)):
    """Initial migration and bulk sync from localStorage."""
    try:
        added_count = 0
        for d in drawings_data:
            # Check if exists by a combination of type and points if id not present
            # For simplicity, we'll just add them if they come from migration
            db_drawing = db_mod.Drawing(
                symbol=symbol,
                type=d.type,
                points=json.dumps([p.model_dump() for p in d.points]),
                color=d.color,
                line_width=d.line_width,
                line_style=d.line_style,
                text=d.text
            )
            db.add(db_drawing)
            added_count += 1
        db.commit()
        return {"message": f"Synced {added_count} drawings"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/tickers/{symbol}/drawings/", response_model=schemas.Drawing)
def create_drawing(symbol: str, drawing_data: schemas.DrawingCreate, db: Session = Depends(get_db)):
    try:
        db_drawing = db_mod.Drawing(
            symbol=symbol,
            type=drawing_data.type,
            points=json.dumps([p.model_dump() for p in drawing_data.points]),
            color=drawing_data.color,
            line_width=drawing_data.line_width,
            line_style=drawing_data.line_style,
            text=drawing_data.text
        )
        db.add(db_drawing)
        db.commit()
        db.refresh(db_drawing)
        return db_drawing
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/drawings/{drawing_id}", response_model=schemas.Drawing)
def update_drawing(drawing_id: int, drawing_data: schemas.DrawingBase, db: Session = Depends(get_db)):
    db_drawing = db.query(db_mod.Drawing).filter(db_mod.Drawing.id == drawing_id).first()
    if not db_drawing:
        raise HTTPException(status_code=404, detail="Drawing not found")
    
    try:
        db_drawing.type = drawing_data.type
        db_drawing.points = json.dumps([p.model_dump() for p in drawing_data.points])
        db_drawing.color = drawing_data.color
        db_drawing.line_width = drawing_data.line_width
        db_drawing.line_style = drawing_data.line_style
        db_drawing.text = drawing_data.text
        db.commit()
        db.refresh(db_drawing)
        return db_drawing
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/drawings/{drawing_id}")
def delete_drawing(drawing_id: int, db: Session = Depends(get_db)):
    db_drawing = db.query(db_mod.Drawing).filter(db_mod.Drawing.id == drawing_id).first()
    if not db_drawing:
        raise HTTPException(status_code=404, detail="Drawing not found")
    db.delete(db_drawing)
    db.commit()
    return {"message": "Drawing deleted"}

@app.delete("/tickers/{symbol}/drawings/")
def delete_all_drawings(symbol: str, db: Session = Depends(get_db)):
    db.query(db_mod.Drawing).filter(db_mod.Drawing.symbol == symbol).delete()
    db.commit()
    return {"message": f"All drawings for {symbol} deleted"}

# --- Alarm Endpoints ---

@app.get("/alarms/", response_model=List[schemas.AlarmOut])
def get_all_alarms(db: Session = Depends(get_db)):
    """Retrieve all alarms across all tickers."""
    return db.query(db_mod.Alarm).all()

@app.post("/drawings/{drawing_id}/alarm", response_model=schemas.Alarm)
def set_alarm(drawing_id: int, alarm_data: schemas.AlarmCreate, db: Session = Depends(get_db)):
    """Create or update an alarm for a specific drawing."""
    db_drawing = db.query(db_mod.Drawing).filter(db_mod.Drawing.id == drawing_id).first()
    if not db_drawing:
        raise HTTPException(status_code=404, detail="Drawing not found")
    
    db_alarm = db.query(db_mod.Alarm).filter(db_mod.Alarm.drawing_id == drawing_id).first()
    if db_alarm:
        db_alarm.is_active = alarm_data.is_active
        db_alarm.trigger_type = alarm_data.trigger_type
        db_alarm.triggered_at = None # Reset triggered status on update
    else:
        db_alarm = db_mod.Alarm(
            drawing_id=drawing_id,
            is_active=alarm_data.is_active,
            trigger_type=alarm_data.trigger_type
        )
        db.add(db_alarm)
    
    db.commit()
    db.refresh(db_alarm)
    
    # Immediately check against current latest prices for this symbol
    finance_logic.check_alarms(db, db_drawing.symbol)
    
    return db_alarm

@app.delete("/drawings/{drawing_id}/alarm")
def delete_alarm(drawing_id: int, db: Session = Depends(get_db)):
    """Delete an alarm associated with a drawing."""
    db_alarm = db.query(db_mod.Alarm).filter(db_mod.Alarm.drawing_id == drawing_id).first()
    if not db_alarm:
        raise HTTPException(status_code=404, detail="Alarm not found")
    db.delete(db_alarm)
    db.commit()
    return {"message": "Alarm deleted"}

# --- Google Sheet Endpoints ---

@app.get("/gsheet/data")
def get_gsheet_data(spreadsheet_name: str = "Investing"):
    try:
        import gspread
        import os
        creds_path = os.path.join(os.path.dirname(__file__), "python-to-gsheet-374817-ea2cd7bca11f.json")
        gc = gspread.service_account(filename=creds_path)
        spreadsheet = gc.open(spreadsheet_name)
        worksheet_list = spreadsheet.worksheets()
        result = {}
        for ws in worksheet_list:
            all_values = ws.get_all_values()
            if not all_values:
                result[ws.title] = []
                continue
            # Use first row as headers, deduplicate if needed
            raw_headers = all_values[0]
            headers = []
            seen = {}
            for h in raw_headers:
                if h in seen:
                    seen[h] += 1
                    headers.append(f"{h}_{seen[h]}")
                else:
                    seen[h] = 1
                    headers.append(h)
            # Build list of dicts from remaining rows
            records = []
            for row in all_values[1:]:
                # Pad row if shorter than headers
                padded = row + [''] * (len(headers) - len(row))
                records.append(dict(zip(headers, padded[:len(headers)])))
            result[ws.title] = records
        return result
    except Exception as e:
        logger.error(f"Error reading Google Sheet '{spreadsheet_name}': {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/tickers/{symbol}/fundamentals/historical", response_model=Optional[schemas.HistoricalFundamentalData])
def get_historical_ticker_fundamentals(symbol: str, date: str, db: Session = Depends(get_db)):
    fund = finance_logic.get_historical_fundamental_data(db, symbol, date)
    if not fund:
        raise HTTPException(status_code=404, detail=f"Historical fundamental data not found for {symbol} on date {date}")
    return fund

@app.get("/tickers/{symbol}/fundamentals", response_model=Optional[schemas.FundamentalData])
def get_ticker_fundamentals(symbol: str, db: Session = Depends(get_db)):
    return finance_logic.get_fundamental_data(db, symbol)

@app.post("/tickers/{symbol}/fundamentals/update", response_model=schemas.FundamentalData)
def update_ticker_fundamentals(symbol: str, db: Session = Depends(get_db)):
    db_fund = finance_logic.update_fundamental_data(db, symbol)
    if not db_fund:
        raise HTTPException(status_code=404, detail=f"Fundamental data not found for {symbol}")
    return db_fund

@app.get("/lists/{list_id}/fundamentals", response_model=List[schemas.FundamentalData])
def get_list_fundamentals(list_id: int, db: Session = Depends(get_db)):
    if list_id == 0:
        db_tickers = db.query(db_mod.Ticker).all()
    else:
        db_tickers = db.query(db_mod.Ticker).filter(db_mod.Ticker.list_id == list_id).all()
    
    symbols = list(set([t.symbol for t in db_tickers]))
    return db.query(db_mod.FundamentalData).filter(db_mod.FundamentalData.symbol.in_(symbols)).all()

@app.post("/lists/{list_id}/fundamentals/update")
def update_list_fundamentals(list_id: int, db: Session = Depends(get_db)):
    if list_id == 0:
        db_tickers = db.query(db_mod.Ticker).all()
    else:
        db_tickers = db.query(db_mod.Ticker).filter(db_mod.Ticker.list_id == list_id).all()
        
    if not db_tickers:
        raise HTTPException(status_code=404, detail="No tickers found")
    
    # Deduplicate tickers by symbol
    seen = set()
    unique_tickers = []
    for t in db_tickers:
        if t.symbol not in seen:
            seen.add(t.symbol)
            unique_tickers.append(t)
    
    finance_logic.update_list_fundamentals(db, unique_tickers)
    return {"message": f"Planned update for {len(unique_tickers)} unique tickers"}

# === Investing.com Portfolio ===
@app.get("/investing/portfolio")
def get_investing_portfolio(url: str):
    """Scrape portfolio data from Investing.com using the user's Chrome profile."""
    from investing_scraper import scrape_investing_portfolio
    try:
        data = scrape_investing_portfolio(url)
        return {"data": data}
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/investing/portfolio_csv")
def get_investing_portfolio_csv(url: str):
    """Download portfolio data from Investing.com via CSV using the user's Edge profile."""
    from investing_scraper import download_investing_csv
    try:
        result = download_investing_csv(url)
        return result
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/investing/portfolio_csv_local")
def get_investing_portfolio_csv_local():
    """Read portfolio data from the most recent CSV in the local CSV folder."""
    from investing_scraper import read_local_investing_csv
    try:
        result = read_local_investing_csv()
        return result
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Investing.com Portfolio URL Management ---
@app.get("/investing/urls", response_model=List[schemas.PortfolioURL])
def get_portfolio_urls(db: Session = Depends(get_db)):
    return db.query(db_mod.PortfolioURL).all()

@app.post("/investing/urls", response_model=schemas.PortfolioURL)
def create_portfolio_url(url_data: schemas.PortfolioURLCreate, db: Session = Depends(get_db)):
    # Check if exists by name
    existing = db.query(db_mod.PortfolioURL).filter(db_mod.PortfolioURL.name == url_data.name).first()
    if existing:
        existing.url = url_data.url
        db.commit()
        db.refresh(existing)
        return existing
    
    new_url = db_mod.PortfolioURL(name=url_data.name, url=url_data.url)
    db.add(new_url)
    db.commit()
    db.refresh(new_url)
    return new_url

@app.delete("/investing/urls/{url_id}")
def delete_portfolio_url(url_id: int, db: Session = Depends(get_db)):
    url_obj = db.query(db_mod.PortfolioURL).filter(db_mod.PortfolioURL.id == url_id).first()
    if not url_obj:
        raise HTTPException(status_code=404, detail="Portfolio URL not found")
    
    db.delete(url_obj)
    db.commit()
    return {"message": "Portfolio URL deleted"}

# --- Portfolio Tracking Endpoints ---

@app.get("/portfolios/", response_model=List[schemas.Portfolio])
def get_portfolios(db: Session = Depends(get_db)):
    return db.query(db_mod.Portfolio).all()

@app.post("/portfolios/", response_model=schemas.Portfolio)
def create_portfolio(portfolio: schemas.PortfolioCreate, db: Session = Depends(get_db)):
    db_portfolio = db_mod.Portfolio(**portfolio.model_dump())
    db.add(db_portfolio)
    db.commit()
    db.refresh(db_portfolio)
    return db_portfolio

@app.delete("/portfolios/{portfolio_id}")
def delete_portfolio(portfolio_id: int, db: Session = Depends(get_db)):
    db_portfolio = db.query(db_mod.Portfolio).filter(db_mod.Portfolio.id == portfolio_id).first()
    if not db_portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    db.delete(db_portfolio)
    db.commit()
    return {"message": "Portfolio deleted"}

@app.get("/commission_plans/", response_model=List[schemas.CommissionPlan])
def get_commission_plans(db: Session = Depends(get_db)):
    return db.query(db_mod.CommissionPlan).all()

@app.post("/commission_plans/", response_model=schemas.CommissionPlan)
def create_commission_plan(plan: schemas.CommissionPlanCreate, db: Session = Depends(get_db)):
    db_plan = db_mod.CommissionPlan(**plan.model_dump())
    db.add(db_plan)
    db.commit()
    db.refresh(db_plan)
    return db_plan

@app.delete("/commission_plans/{plan_id}")
def delete_commission_plan(plan_id: int, db: Session = Depends(get_db)):
    db_plan = db.query(db_mod.CommissionPlan).filter(db_mod.CommissionPlan.id == plan_id).first()
    if not db_plan:
        raise HTTPException(status_code=404, detail="Commission Plan not found")
    db.delete(db_plan)
    db.commit()
    return {"message": "Commission Plan deleted"}

# --- Tax Plan Endpoints ---

@app.get("/tax_plans/", response_model=List[schemas.TaxPlan])
def get_tax_plans(type: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(db_mod.TaxPlan)
    if type:
        q = q.filter(db_mod.TaxPlan.type == type)
    return q.all()

@app.post("/tax_plans/", response_model=schemas.TaxPlan)
def create_tax_plan(plan: schemas.TaxPlanCreate, db: Session = Depends(get_db)):
    db_plan = db_mod.TaxPlan(**plan.model_dump())
    db.add(db_plan)
    db.commit()
    db.refresh(db_plan)
    return db_plan

@app.delete("/tax_plans/{plan_id}")
def delete_tax_plan(plan_id: int, db: Session = Depends(get_db)):
    db_plan = db.query(db_mod.TaxPlan).filter(db_mod.TaxPlan.id == plan_id).first()
    if not db_plan:
        raise HTTPException(status_code=404, detail="Tax Plan not found")
    db.delete(db_plan)
    db.commit()
    return {"message": "Tax Plan deleted"}

# --- Broker Endpoints ---

@app.get("/brokers/", response_model=List[schemas.Broker])
def get_brokers(db: Session = Depends(get_db)):
    return db.query(db_mod.Broker).order_by(db_mod.Broker.name.asc()).all()

@app.post("/brokers/", response_model=schemas.Broker)
def create_broker(broker: schemas.BrokerCreate, db: Session = Depends(get_db)):
    db_broker = db_mod.Broker(**broker.model_dump())
    db.add(db_broker)
    db.commit()
    db.refresh(db_broker)
    return db_broker

@app.delete("/brokers/{broker_id}")
def delete_broker(broker_id: int, db: Session = Depends(get_db)):
    db_broker = db.query(db_mod.Broker).filter(db_mod.Broker.id == broker_id).first()
    if not db_broker:
        raise HTTPException(status_code=404, detail="Broker not found")
    # Unlink transactions pointing to this broker
    db.query(db_mod.Transaction).filter(db_mod.Transaction.broker_id == broker_id).update(
        {db_mod.Transaction.broker_id: None}
    )
    db.delete(db_broker)
    db.commit()
    return {"message": "Broker deleted"}

# --- Fiscal Backpack Endpoints ---

@app.get("/brokers/{broker_id}/fiscal_backpack")
def get_fiscal_backpack(broker_id: int, db: Session = Depends(get_db)):
    entries = db.query(db_mod.FiscalBackpackEntry).filter(
        db_mod.FiscalBackpackEntry.broker_id == broker_id
    ).order_by(db_mod.FiscalBackpackEntry.loss_year.asc()).all()
    return [{"loss_year": e.loss_year, "remaining_loss": e.remaining_loss} for e in entries]

@app.put("/brokers/{broker_id}/fiscal_backpack")
def reset_fiscal_backpack(broker_id: int, db: Session = Depends(get_db)):
    """Resetta manualmente lo zainetto fiscale (tutti gli anni) per un broker."""
    db.query(db_mod.FiscalBackpackEntry).filter(
        db_mod.FiscalBackpackEntry.broker_id == broker_id
    ).delete()
    db.commit()
    return {"message": "Fiscal backpack reset"}

@app.get("/portfolios/{portfolio_id}/transactions/", response_model=List[schemas.Transaction])
def get_transactions(portfolio_id: int, db: Session = Depends(get_db)):
    return db.query(db_mod.Transaction).filter(db_mod.Transaction.portfolio_id == portfolio_id).order_by(db_mod.Transaction.date.desc()).all()

@app.get("/transactions/ticker/{symbol}", response_model=List[schemas.Transaction])
def get_ticker_transactions(symbol: str, db: Session = Depends(get_db)):
    return db.query(db_mod.Transaction).filter(db_mod.Transaction.ticker == symbol).order_by(db_mod.Transaction.date.asc()).all()


@app.post("/portfolios/{portfolio_id}/transactions/", response_model=schemas.Transaction)
def create_transaction(portfolio_id: int, transaction: schemas.TransactionCreate, db: Session = Depends(get_db)):
    # Validate portfolio
    db_portfolio = db.query(db_mod.Portfolio).filter(db_mod.Portfolio.id == portfolio_id).first()
    if not db_portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    
    # Calculate commission if a plan is provided
    commission_paid = 0.0
    if transaction.commission_plan_id:
        plan = db.query(db_mod.CommissionPlan).filter(db_mod.CommissionPlan.id == transaction.commission_plan_id).first()
        if plan:
            if plan.type == "absolute":
                commission_paid = plan.fixed_fee
            elif plan.type == "percentage":
                trade_value_in_base = (transaction.price * transaction.quantity) * transaction.exchange_rate
                calc_comm = trade_value_in_base * (plan.percentage / 100.0)
                calc_comm += plan.fixed_fee
                if plan.min_fee and calc_comm < plan.min_fee:
                    calc_comm = plan.min_fee
                if plan.max_fee and calc_comm > plan.max_fee:
                    calc_comm = plan.max_fee
                commission_paid = calc_comm
    
    # Validate broker if provided
    if transaction.broker_id:
        broker = db.query(db_mod.Broker).filter(db_mod.Broker.id == transaction.broker_id).first()
        if not broker:
            raise HTTPException(status_code=400, detail="Broker not found")

    trans_data = transaction.model_dump()
    trans_data['commission_paid'] = commission_paid
    trans_data['portfolio_id'] = portfolio_id

    # Calculate Tobin tax if a plan is provided for BUY
    tobin_tax_paid = 0.0
    if transaction.tobin_tax_plan_id and transaction.type == "BUY":
        tax_plan = db.query(db_mod.TaxPlan).filter(
            db_mod.TaxPlan.id == transaction.tobin_tax_plan_id,
            db_mod.TaxPlan.type == "tobin"
        ).first()
        if tax_plan:
            trade_value_in_base = (transaction.price * transaction.quantity) * transaction.exchange_rate
            tobin_tax_paid = trade_value_in_base * (tax_plan.rate / 100.0)
    trans_data['tobin_tax_paid'] = tobin_tax_paid

    # For DIVIDEND: resolve rate from dividend_tax_plan_id if provided
    if transaction.type == "DIVIDEND" and transaction.dividend_tax_plan_id:
        tax_plan = db.query(db_mod.TaxPlan).filter(
            db_mod.TaxPlan.id == transaction.dividend_tax_plan_id,
            db_mod.TaxPlan.type == "dividend"
        ).first()
        if tax_plan:
            trans_data['tax_rate'] = tax_plan.rate

    db_trans = db_mod.Transaction(**trans_data)
    db.add(db_trans)
    
    # Update cash balance for DEPOSIT/WITHDRAWAL directly
    if db_trans.type == "DEPOSIT":
        db_portfolio.cash_balance += db_trans.quantity
    elif db_trans.type == "WITHDRAWAL":
        db_portfolio.cash_balance -= db_trans.quantity
    elif db_trans.type == "DIVIDEND":
        # Dividends update cash only (not position quantity/PMC).
        # The sign of `quantity` encodes direction: + = receive (LONG), - = pay (SHORT).
        # Tax is stored in commission_paid (in base_currency) for reversibility.
        shares = abs(db_trans.quantity)
        gross_base = db_trans.price * shares * db_trans.exchange_rate
        tax_base = gross_base * (db_trans.tax_rate / 100.0) if (db_trans.tax_rate and db_trans.tax_rate > 0) else 0.0
        db_trans.commission_paid = tax_base
        if db_trans.quantity >= 0:
            db_portfolio.cash_balance += (gross_base - tax_base)
        else:
            db_portfolio.cash_balance -= (gross_base + tax_base)
    else:
        # Cash accounting
        trade_val = (db_trans.price * db_trans.quantity) * db_trans.exchange_rate
        if db_trans.type in ["BUY", "COVER"]:
            db_portfolio.cash_balance -= (trade_val + db_trans.commission_paid + db_trans.tobin_tax_paid)
        elif db_trans.type in ["SELL", "SHORT"]:
            db_portfolio.cash_balance += (trade_val - db_trans.commission_paid)

    db.commit()
    db.refresh(db_trans)
    return db_trans

@app.delete("/transactions/{transaction_id}")
def delete_transaction(transaction_id: int, db: Session = Depends(get_db)):
    db_trans = db.query(db_mod.Transaction).filter(db_mod.Transaction.id == transaction_id).first()
    if not db_trans:
        raise HTTPException(status_code=404, detail="Transaction not found")
        
    db_portfolio = db.query(db_mod.Portfolio).filter(db_mod.Portfolio.id == db_trans.portfolio_id).first()
    
    # Reverse cash impact
    if db_trans.type == "DEPOSIT":
        db_portfolio.cash_balance -= db_trans.quantity
    elif db_trans.type == "WITHDRAWAL":
        db_portfolio.cash_balance += db_trans.quantity
    elif db_trans.type == "DIVIDEND":
        db_portfolio.cash_balance -= _compute_dividend_cash_delta(
            db_trans.price, db_trans.quantity, db_trans.exchange_rate, db_trans.tax_rate or 0.0
        )
    else:
        trade_val = (db_trans.price * db_trans.quantity) * db_trans.exchange_rate
        if db_trans.type in ["BUY", "COVER"]:
            db_portfolio.cash_balance += (trade_val + db_trans.commission_paid + db_trans.tobin_tax_paid)
        elif db_trans.type in ["SELL", "SHORT"]:
            db_portfolio.cash_balance -= (trade_val - db_trans.commission_paid)
            
    db.delete(db_trans)
    db.commit()
    return {"message": "Transaction deleted"}

@app.put("/transactions/{transaction_id}", response_model=schemas.Transaction)
def update_transaction(transaction_id: int, transaction: schemas.TransactionCreate, db: Session = Depends(get_db)):
    db_trans = db.query(db_mod.Transaction).filter(db_mod.Transaction.id == transaction_id).first()
    if not db_trans:
        raise HTTPException(status_code=404, detail="Transaction not found")
        
    db_portfolio = db.query(db_mod.Portfolio).filter(db_mod.Portfolio.id == db_trans.portfolio_id).first()
    if not db_portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")

    # 1. Reverse old cash impact
    if db_trans.type == "DEPOSIT":
        db_portfolio.cash_balance -= db_trans.quantity
    elif db_trans.type == "WITHDRAWAL":
        db_portfolio.cash_balance += db_trans.quantity
    elif db_trans.type == "DIVIDEND":
        db_portfolio.cash_balance -= _compute_dividend_cash_delta(
            db_trans.price, db_trans.quantity, db_trans.exchange_rate, db_trans.tax_rate or 0.0
        )
    else:
        old_trade_val = (db_trans.price * db_trans.quantity) * db_trans.exchange_rate
        if db_trans.type in ["BUY", "COVER"]:
            db_portfolio.cash_balance += (old_trade_val + db_trans.commission_paid + db_trans.tobin_tax_paid)
        elif db_trans.type in ["SELL", "SHORT"]:
            db_portfolio.cash_balance -= (old_trade_val - db_trans.commission_paid)

    # Validate new broker_id if provided
    if transaction.broker_id:
        broker = db.query(db_mod.Broker).filter(db_mod.Broker.id == transaction.broker_id).first()
        if not broker:
            raise HTTPException(status_code=400, detail="Broker not found")

    # 2. Calculate new commission if a plan is provided
    commission_paid = 0.0
    if transaction.commission_plan_id:
        plan = db.query(db_mod.CommissionPlan).filter(db_mod.CommissionPlan.id == transaction.commission_plan_id).first()
        if plan:
            if plan.type == "absolute":
                commission_paid = plan.fixed_fee
            elif plan.type == "percentage":
                trade_value_in_base = (transaction.price * transaction.quantity) * transaction.exchange_rate
                calc_comm = trade_value_in_base * (plan.percentage / 100.0)
                calc_comm += plan.fixed_fee
                if plan.min_fee and calc_comm < plan.min_fee:
                    calc_comm = plan.min_fee
                if plan.max_fee and calc_comm > plan.max_fee:
                    calc_comm = plan.max_fee
                commission_paid = calc_comm

    # Calculate new Tobin tax if a plan is provided for BUY
    tobin_tax_paid = 0.0
    if transaction.tobin_tax_plan_id and transaction.type == "BUY":
        tax_plan = db.query(db_mod.TaxPlan).filter(
            db_mod.TaxPlan.id == transaction.tobin_tax_plan_id,
            db_mod.TaxPlan.type == "tobin"
        ).first()
        if tax_plan:
            trade_value_in_base = (transaction.price * transaction.quantity) * transaction.exchange_rate
            tobin_tax_paid = trade_value_in_base * (tax_plan.rate / 100.0)

    # Resolve dividend tax rate from plan if provided
    dividend_tax_rate = transaction.tax_rate
    if transaction.dividend_tax_plan_id and transaction.type == "DIVIDEND":
        tax_plan = db.query(db_mod.TaxPlan).filter(
            db_mod.TaxPlan.id == transaction.dividend_tax_plan_id,
            db_mod.TaxPlan.type == "dividend"
        ).first()
        if tax_plan:
            dividend_tax_rate = tax_plan.rate

    # 3. Update fields
    db_trans.ticker = transaction.ticker
    db_trans.broker_id = transaction.broker_id
    db_trans.type = transaction.type
    db_trans.date = transaction.date
    db_trans.quantity = transaction.quantity
    db_trans.price = transaction.price
    db_trans.instrument_currency = transaction.instrument_currency
    db_trans.exchange_rate = transaction.exchange_rate
    db_trans.commission_plan_id = transaction.commission_plan_id
    db_trans.commission_paid = commission_paid
    db_trans.short_borrow_fee_rate = transaction.short_borrow_fee_rate
    db_trans.tax_rate = dividend_tax_rate if transaction.type == "DIVIDEND" else transaction.tax_rate
    db_trans.tobin_tax_plan_id = transaction.tobin_tax_plan_id
    db_trans.tobin_tax_paid = tobin_tax_paid
    db_trans.capital_gains_tax_plan_id = transaction.capital_gains_tax_plan_id
    db_trans.dividend_tax_plan_id = transaction.dividend_tax_plan_id
    db_trans.note = transaction.note

    # 4. Apply new cash impact
    if db_trans.type == "DEPOSIT":
        db_portfolio.cash_balance += db_trans.quantity
    elif db_trans.type == "WITHDRAWAL":
        db_portfolio.cash_balance -= db_trans.quantity
    elif db_trans.type == "DIVIDEND":
        # For DIVIDEND, the tax is stored in commission_paid for reversibility
        shares = abs(db_trans.quantity)
        gross_base = db_trans.price * shares * db_trans.exchange_rate
        tax_base = gross_base * (dividend_tax_rate / 100.0) if (dividend_tax_rate and dividend_tax_rate > 0) else 0.0
        db_trans.commission_paid = tax_base
        if db_trans.quantity >= 0:
            db_portfolio.cash_balance += (gross_base - tax_base)
        else:
            db_portfolio.cash_balance -= (gross_base + tax_base)
    else:
        new_trade_val = (db_trans.price * db_trans.quantity) * db_trans.exchange_rate
        if db_trans.type in ["BUY", "COVER"]:
            db_portfolio.cash_balance -= (new_trade_val + db_trans.commission_paid + db_trans.tobin_tax_paid)
        elif db_trans.type in ["SELL", "SHORT"]:
            db_portfolio.cash_balance += (new_trade_val - db_trans.commission_paid)

    db.commit()
    db.refresh(db_trans)
    return db_trans

@app.get("/portfolios/{portfolio_id}/summary")
def get_portfolio_summary(portfolio_id: int, db: Session = Depends(get_db)):
    return finance_logic.get_portfolio_summary(db, portfolio_id)

@app.get("/fx_rate")
def get_fx_rate(base_currency: str, instrument_currency: str, date: str):
    rate = finance_logic.get_historical_fx_rate(instrument_currency, base_currency, date)
    return {"rate": rate}

@app.get("/ticker_price")
def get_ticker_price(symbol: str, date: str, db: Session = Depends(get_db)):
    """Restituisce il prezzo di chiusura più vicino alla data richiesta dal DB price_data."""
    import datetime
    try:
        date_str = date.split('.')[0] if '.' in date else date
        if 'T' in date_str:
            parts = date_str.split('T')
            time_part = parts[1]
            if len(time_part.split(':')) == 2:
                date_str += ':00'
            dt = datetime.datetime.strptime(date_str, "%Y-%m-%dT%H:%M:%S")
        else:
            dt = datetime.datetime.strptime(date_str, "%Y-%m-%d")
    except Exception:
        return {"price": None}

    rec = db.query(db_mod.PriceData).filter(
        db_mod.PriceData.symbol == symbol,
        db_mod.PriceData.date <= dt
    ).order_by(db_mod.PriceData.date.desc()).first()

    if rec:
        return {"price": rec.close}
    return {"price": None}

# Serve Frontend
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    # Usa la stringa "main:app" invece dell'oggetto app per abilitare il reload
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
