from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, ForeignKey, Text, UniqueConstraint, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from sqlalchemy.sql import func
import datetime
import os

# Environment variables for database URLs with sensible defaults
CONFIG_DATABASE_URL = os.getenv("CONFIG_DATABASE_URL", "sqlite:///./config.db")
MARKET_DATABASE_URL = os.getenv("MARKET_DATABASE_URL", "sqlite:///./market.db")

# Separate engines for config and market data
config_engine = create_engine(
    CONFIG_DATABASE_URL, connect_args={"check_same_thread": False}
)
market_engine = create_engine(
    MARKET_DATABASE_URL, connect_args={"check_same_thread": False}
)

# Separate session makers
SessionLocalConfig = sessionmaker(autocommit=False, autoflush=False, bind=config_engine)
SessionLocalMarket = sessionmaker(autocommit=False, autoflush=False, bind=market_engine)

# Backward compatibility shim - existing code uses these
# This allows existing tests and scripts to continue working without modification
# They will use the config database by default (safe for reads/writes to config tables)
SQLALCHEMY_DATABASE_URL = CONFIG_DATABASE_URL  # For backward compatibility
engine = config_engine  # For backward compatibility
SessionLocal = SessionLocalConfig  # For backward compatibility

# Separate base classes for each database
ConfigBase = declarative_base()  # For config/user data
MarketBase = declarative_base()  # For market/derived data

# ===== CONFIG TABLES (User-specific data) =====
# These go in config.db and will be committed to Git

class TickerList(ConfigBase):
    __tablename__ = "ticker_lists"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    tickers = relationship("Ticker", back_populates="list_ref", cascade="all, delete-orphan")

class Ticker(ConfigBase):
    __tablename__ = "tickers"

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String, index=True, nullable=True)
    name = Column(String, nullable=True)
    isin = Column(String, nullable=True, index=True)
    mic = Column(String, nullable=True, default="ETLX")
    alias = Column(String, nullable=True)
    note = Column(Text, default="")
    list_id = Column(Integer, ForeignKey("ticker_lists.id"))
    list_ref = relationship("TickerList", back_populates="tickers")

    __table_args__ = (UniqueConstraint('symbol', 'list_id', name='_symbol_list_uc'),
                      UniqueConstraint('isin', 'list_id', name='_isin_list_uc'),)

class ChartTemplate(ConfigBase):
    __tablename__ = "chart_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    indicators = relationship("TemplateIndicator", back_populates="template", cascade="all, delete-orphan")

class TemplateIndicator(ConfigBase):
    __tablename__ = "template_indicators"

    id = Column(Integer, primary_key=True, index=True)
    template_id = Column(Integer, ForeignKey("chart_templates.id"))
    indicator_type = Column(String)  # SMA, EMA, RSI, MACD, etc.
    parameters = Column(String)      # JSON string of settings e.g. {"period": 14}
    pane_index = Column(Integer, default=0)  # 0: Main, 1+: Subplots
    color = Column(String, nullable=True)

    template = relationship("ChartTemplate", back_populates="indicators")

class ScreeningSheet(ConfigBase):
    __tablename__ = "screening_sheets"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    columns = relationship("ScreeningColumn", back_populates="sheet", cascade="all, delete-orphan")

class ScreeningColumn(ConfigBase):
    __tablename__ = "screening_columns"

    id = Column(Integer, primary_key=True, index=True)
    sheet_id = Column(Integer, ForeignKey("screening_sheets.id"))
    indicator_type = Column(String)
    parameters = Column(String) # JSON string
    timeframe = Column(String, default="D")
    color = Column(String, nullable=True)

    sheet = relationship("ScreeningSheet", back_populates="columns")

class Drawing(ConfigBase):
    __tablename__ = "drawings"

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String, index=True)
    type = Column(String)  # horizontal_line, trend_line, ray, etc.
    points = Column(String)  # JSON string of coordinates: [{"time": "...", "price": ...}]
    color = Column(String)
    line_width = Column(Float)
    line_style = Column(String, default='solid')
    text = Column(String, nullable=True)
    pane_index = Column(Integer, default=0)
    
    alarms = relationship("Alarm", back_populates="drawing", cascade="all, delete-orphan")

class Alarm(ConfigBase):
    __tablename__ = "alarms"

    id = Column(Integer, primary_key=True, index=True)
    drawing_id = Column(Integer, ForeignKey("drawings.id"))
    is_active = Column(Integer, default=1)  # 0 or 1
    trigger_type = Column(String, default="close")  # close or intraday
    triggered_at = Column(DateTime, nullable=True)
    last_checked_price = Column(Float, nullable=True)
    
    drawing = relationship("Drawing", back_populates="alarms")

class PortfolioURL(ConfigBase):
    __tablename__ = "portfolio_urls"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    url = Column(String)
    last_updated = Column(DateTime, default=func.now(), onupdate=func.now())

class Portfolio(ConfigBase):
    __tablename__ = "portfolios"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    base_currency = Column(String, default="EUR")
    cash_balance = Column(Float, default=0.0)

    transactions = relationship("Transaction", back_populates="portfolio", cascade="all, delete-orphan")

class CommissionPlan(ConfigBase):
    __tablename__ = "commission_plans"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    type = Column(String)  # 'absolute' or 'percentage'
    fixed_fee = Column(Float, default=0.0)
    percentage = Column(Float, default=0.0)
    min_fee = Column(Float, default=0.0)
    max_fee = Column(Float, nullable=True)
    currency = Column(String, default="EUR")

    transactions = relationship("Transaction", back_populates="commission_plan")

class Broker(ConfigBase):
    __tablename__ = "brokers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)

    transactions = relationship("Transaction", back_populates="broker")

    def __repr__(self):
        return f"<Broker(id={self.id}, name='{self.name}')>"

class TaxPlan(ConfigBase):
    __tablename__ = "tax_plans"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    type = Column(String)  # 'tobin', 'capital_gains', 'dividend'
    rate = Column(Float, default=0.0)
    currency = Column(String, default="EUR")

    transactions_tobin = relationship("Transaction", back_populates="tobin_tax_plan", foreign_keys="Transaction.tobin_tax_plan_id")
    transactions_cg = relationship("Transaction", back_populates="capital_gains_tax_plan", foreign_keys="Transaction.capital_gains_tax_plan_id")
    transactions_dividend = relationship("Transaction", back_populates="dividend_tax_plan", foreign_keys="Transaction.dividend_tax_plan_id")
    transactions_coupon = relationship("Transaction", back_populates="coupon_tax_plan", foreign_keys="Transaction.coupon_tax_plan_id")

class FiscalBackpackEntry(ConfigBase):
    __tablename__ = "fiscal_backpack_entries"

    id = Column(Integer, primary_key=True, index=True)
    broker_id = Column(Integer, ForeignKey("brokers.id"), index=True)
    loss_year = Column(Integer, index=True)
    remaining_loss = Column(Float, default=0.0)

    broker = relationship("Broker")

class Transaction(ConfigBase):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    portfolio_id = Column(Integer, ForeignKey("portfolios.id"))
    broker_id = Column(Integer, ForeignKey("brokers.id"), nullable=True)
    ticker = Column(String, index=True)
    type = Column(String) # BUY, SELL, SHORT, COVER, DEPOSIT, WITHDRAWAL
    date = Column(DateTime, index=True)
    quantity = Column(Float, default=0.0)
    price = Column(Float, default=0.0) # In instrument currency
    instrument_currency = Column(String, default="EUR")
    exchange_rate = Column(Float, default=1.0) # Multiplier to convert to base_currency
    commission_plan_id = Column(Integer, ForeignKey("commission_plans.id"), nullable=True)
    commission_paid = Column(Float, default=0.0) # In base_currency
    short_borrow_fee_rate = Column(Float, default=0.0) # Annual percentage rate e.g., 5.0 for 5%
    tax_rate = Column(Float, default=0.0) # Dividend tax rate (percent), used for type=DIVIDEND
    tobin_tax_plan_id = Column(Integer, ForeignKey("tax_plans.id"), nullable=True)
    tobin_tax_paid = Column(Float, default=0.0)
    capital_gains_tax_plan_id = Column(Integer, ForeignKey("tax_plans.id"), nullable=True)
    capital_gains_tax_paid = Column(Float, default=0.0)
    dividend_tax_plan_id = Column(Integer, ForeignKey("tax_plans.id"), nullable=True)
    coupon_tax_plan_id = Column(Integer, ForeignKey("tax_plans.id"), nullable=True)
    instrument_type = Column(String, default="STOCK")  # STOCK, BOND, CERTIFICATE, ETC, ETN
    note = Column(Text, default="")

    portfolio = relationship("Portfolio", back_populates="transactions")
    broker = relationship("Broker", back_populates="transactions")
    commission_plan = relationship("CommissionPlan", back_populates="transactions")
    tobin_tax_plan = relationship("TaxPlan", back_populates="transactions_tobin", foreign_keys=[tobin_tax_plan_id])
    capital_gains_tax_plan = relationship("TaxPlan", back_populates="transactions_cg", foreign_keys=[capital_gains_tax_plan_id])
    dividend_tax_plan = relationship("TaxPlan", back_populates="transactions_dividend", foreign_keys=[dividend_tax_plan_id])
    coupon_tax_plan = relationship("TaxPlan", back_populates="transactions_coupon", foreign_keys=[coupon_tax_plan_id])

class TickerMapping(ConfigBase):
    __tablename__ = "ticker_mappings"

    id = Column(Integer, primary_key=True, index=True)
    symbol_yahoo = Column(String, unique=True, index=True)
    symbol_investing = Column(String, index=True)
    name = Column(String, nullable=True)
    last_updated = Column(DateTime, default=func.now(), onupdate=func.now())

# ===== MARKET TABLES (Market data - regenerable from internet) =====
# These go in market.db and are gitignored

class PriceData(MarketBase):
    __tablename__ = "price_data"

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String, index=True)
    date = Column(DateTime, index=True)
    open = Column(Float)
    high = Column(Float)
    low = Column(Float)
    close = Column(Float)
    adj_close = Column(Float)
    volume = Column(Integer)

    __table_args__ = (UniqueConstraint('symbol', 'date', name='_symbol_date_uc'),)

class FundamentalData(MarketBase):
    __tablename__ = "fundamental_data"

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String, unique=True, index=True)
    
    # Key Metrics
    market_cap = Column(Float, nullable=True)
    pe_ratio = Column(Float, nullable=True)
    forward_pe = Column(Float, nullable=True)
    ps_ratio = Column(Float, nullable=True)
    pb_ratio = Column(Float, nullable=True)
    dividend_yield = Column(Float, nullable=True)
    beta = Column(Float, nullable=True)
    
    # Financials
    total_revenue = Column(Float, nullable=True)
    revenue_growth = Column(Float, nullable=True)
    gross_margins = Column(Float, nullable=True)
    ebitda_margins = Column(Float, nullable=True)
    operating_margins = Column(Float, nullable=True)
    profit_margins = Column(Float, nullable=True)
    
    # Cash/Debt
    total_cash = Column(Float, nullable=True)
    total_debt = Column(Float, nullable=True)
    current_ratio = Column(Float, nullable=True)
    
    # Metadata
    sector = Column(String, nullable=True)
    industry = Column(String, nullable=True)
    long_business_summary = Column(String, nullable=True)
    
    last_updated = Column(DateTime, default=func.now(), onupdate=func.now())
    raw_info = Column(String, nullable=True) # Full JSON dump for future use

class HistoricalFundamentalData(MarketBase):
    __tablename__ = "historical_fundamental_data"

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String, index=True)
    quarter_date = Column(DateTime, index=True) # Ending date of the reported quarter, e.g. 2024-03-31
    
    # Key Metrics
    market_cap = Column(Float, nullable=True)
    pe_ratio = Column(Float, nullable=True)
    forward_pe = Column(Float, nullable=True)
    ps_ratio = Column(Float, nullable=True)
    pb_ratio = Column(Float, nullable=True)
    dividend_yield = Column(Float, nullable=True)
    beta = Column(Float, nullable=True)
    
    # Financials
    total_revenue = Column(Float, nullable=True)
    revenue_growth = Column(Float, nullable=True)
    gross_margins = Column(Float, nullable=True)
    ebitda_margins = Column(Float, nullable=True)
    operating_margins = Column(Float, nullable=True)
    profit_margins = Column(Float, nullable=True)
    
    # Cash/Debt
    total_cash = Column(Float, nullable=True)
    total_debt = Column(Float, nullable=True)
    current_ratio = Column(Float, nullable=True)
    
    # Core Financial Inputs for dynamic recalculation
    shares = Column(Float, nullable=True)
    ttm_eps = Column(Float, nullable=True)
    book_value = Column(Float, nullable=True)
    
    # Metadata
    sector = Column(String, nullable=True)
    industry = Column(String, nullable=True)
    long_business_summary = Column(String, nullable=True)
    
    last_updated = Column(DateTime, default=func.now(), onupdate=func.now())
    raw_info = Column(String, nullable=True) # Full JSON dump of raw quarterly data
    
    __table_args__ = (UniqueConstraint('symbol', 'quarter_date', name='_symbol_quarter_uc'),)

class ScreeningValue(MarketBase):
    __tablename__ = "screening_values"

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String, index=True)
    indicator_key = Column(String, index=True) # e.g. "sma_period20_W"
    date = Column(DateTime, index=True)
    value = Column(Float)
    
    __table_args__ = (UniqueConstraint('symbol', 'indicator_key', 'date', name='_symbol_ind_date_uc'),)

def _migrate_config():
    """Apply migrations specific to config database."""
    try:
        with config_engine.connect() as conn:
            # Migration: add line_style column if it doesn't exist
            try:
                conn.execute(text("ALTER TABLE drawings ADD COLUMN line_style VARCHAR DEFAULT 'solid'"))
                conn.commit()
            except Exception:
                pass  # Column already exists
            
            # Migration: add note column to transactions if it doesn't exist
            try:
                conn.execute(text("ALTER TABLE transactions ADD COLUMN note TEXT DEFAULT ''"))
                conn.commit()
            except Exception:
                pass  # Column already exists
            
            # Migration: add tax_rate column to transactions if it doesn't exist
            try:
                conn.execute(text("ALTER TABLE transactions ADD COLUMN tax_rate FLOAT DEFAULT 0.0"))
                conn.commit()
            except Exception:
                pass  # Column already exists
            
            # Migration: add tobin_tax columns to transactions
            try:
                conn.execute(text("ALTER TABLE transactions ADD COLUMN tobin_tax_plan_id INTEGER REFERENCES tax_plans(id)"))
                conn.commit()
            except Exception:
                pass
            try:
                conn.execute(text("ALTER TABLE transactions ADD COLUMN tobin_tax_paid FLOAT DEFAULT 0.0"))
                conn.commit()
            except Exception:
                pass
            try:
                conn.execute(text("ALTER TABLE transactions ADD COLUMN capital_gains_tax_plan_id INTEGER REFERENCES tax_plans(id)"))
                conn.commit()
            except Exception:
                pass
            try:
                conn.execute(text("ALTER TABLE transactions ADD COLUMN capital_gains_tax_paid FLOAT DEFAULT 0.0"))
                conn.commit()
            except Exception:
                pass
            try:
                conn.execute(text("ALTER TABLE transactions ADD COLUMN dividend_tax_plan_id INTEGER REFERENCES tax_plans(id)"))
                conn.commit()
            except Exception:
                pass
            # Migration: add coupon_tax_plan_id column
            try:
                conn.execute(text("ALTER TABLE transactions ADD COLUMN coupon_tax_plan_id INTEGER REFERENCES tax_plans(id)"))
                conn.commit()
            except Exception:
                pass
            # Migration: add instrument_type column
            try:
                conn.execute(text("ALTER TABLE transactions ADD COLUMN instrument_type VARCHAR DEFAULT 'STOCK'"))
                conn.commit()
            except Exception:
                pass
            # Migration: add broker_id column to transactions
            try:
                conn.execute(text("ALTER TABLE transactions ADD COLUMN broker_id INTEGER REFERENCES brokers(id)"))
                conn.commit()
            except Exception:
                pass
            # Migration: add pane_index column to drawings
            try:
                conn.execute(text("ALTER TABLE drawings ADD COLUMN pane_index INTEGER DEFAULT 0"))
                conn.commit()
            except Exception:
                pass
            try:
                conn.execute(text("UPDATE drawings SET pane_index = 0 WHERE pane_index IS NULL"))
                conn.commit()
            except Exception:
                pass
            # Migration: add isin column to tickers
            try:
                conn.execute(text("ALTER TABLE tickers ADD COLUMN isin VARCHAR"))
                conn.commit()
            except Exception:
                pass
            # Migration: add mic column to tickers
            try:
                conn.execute(text("ALTER TABLE tickers ADD COLUMN mic VARCHAR DEFAULT 'ETLX'"))
                conn.commit()
            except Exception:
                pass
            # Migration: add note column to tickers
            try:
                conn.execute(text("ALTER TABLE tickers ADD COLUMN note TEXT DEFAULT ''"))
                conn.commit()
            except Exception:
                pass
            # Migration: make symbol nullable — SQLite doesn't support ALTER COLUMN,
            # but new Ticker entries will have symbol=NULL allowed by the model.
    except Exception as e:
        print(f"Warning: Config migration failed: {e}")

def _migrate_market():
    """Apply migrations specific to market database.
    Currently no migrations needed, but kept for future use."""
    pass

def _ensure_default_broker():
    """Ensure default broker exists in config database."""
    try:
        from sqlalchemy.orm import Session as SASession
        with SessionLocalConfig() as session:
            default = session.query(Broker).filter(Broker.name == "Generale").first()
            if not default:
                default = Broker(name="Generale")
                session.add(default)
                session.commit()
                # Assign all existing transactions without broker to the default broker
                session.query(Transaction).filter(Transaction.broker_id == None).update(
                    {Transaction.broker_id: default.id}
                )
                session.commit()
    except Exception:
        pass  # Ignore errors in default broker creation

def init_db():
    """Initialize both databases - creates tables if they don't exist."""
    # Create all tables in config database
    ConfigBase.metadata.create_all(bind=config_engine)
    # Create all tables in market database  
    MarketBase.metadata.create_all(bind=market_engine)
    
    # Apply migrations
    _migrate_config()
    _migrate_market()
    
    # Ensure default broker exists
    _ensure_default_broker()

# For backward compatibility - existing code that imports from database
# will still work as expected (uses config database by default)
if __name__ == "__main__":
    init_db()