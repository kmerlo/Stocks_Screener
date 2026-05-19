from pydantic import BaseModel, field_validator
from typing import List, Optional, Union
from datetime import datetime
import json

class TickerBase(BaseModel):
    symbol: str
    name: Optional[str] = None

class TickerCreate(TickerBase):
    pass

class Ticker(TickerBase):
    id: int
    list_id: int

    class Config:
        from_attributes = True

class TickerListBase(BaseModel):
    name: str

class TickerListCreate(TickerListBase):
    pass

class TickerList(TickerListBase):
    id: int
    tickers: List[Ticker] = []

    class Config:
        from_attributes = True

class PriceDataBase(BaseModel):
    symbol: str
    date: datetime
    open: float
    high: float
    low: float
    close: float
    adj_close: float
    volume: int

class PriceData(PriceDataBase):
    id: int

    class Config:
        from_attributes = True

class ScreeningResult(BaseModel):
    symbol: str
    close: float
    ma_slope: float
    status: str # "positive", "negative", "neutral"

class TemplateIndicatorBase(BaseModel):
    indicator_type: str
    parameters: str # JSON string
    pane_index: int = 0
    timeframe: Optional[str] = "D"
    color: Optional[str] = None

class TemplateIndicatorCreate(TemplateIndicatorBase):
    pass

class TemplateIndicator(TemplateIndicatorBase):
    id: int
    template_id: int

    class Config:
        from_attributes = True

class ChartTemplateBase(BaseModel):
    name: str

class ChartTemplateCreate(ChartTemplateBase):
    indicators: List[TemplateIndicatorCreate]

class ChartTemplateUpdate(ChartTemplateBase):
    indicators: List[TemplateIndicatorCreate]

class ChartTemplate(ChartTemplateBase):
    id: int
    indicators: List[TemplateIndicator]

    class Config:
        from_attributes = True

class IndicatorRequest(BaseModel):
    indicator_type: str # e.g. "SMA", "RSI"
    parameters: dict
    pane_index: int = 0
    timeframe: Optional[str] = "D" # D, W, M

class ModularScreeningResult(BaseModel):
    symbol: str
    name: Optional[str] = None
    last_date: str
    last_price: float
    data: dict # Flexible bucket for ROCs, etc.

class ScreeningRequest(BaseModel):
    list_id: int
    roc_periods: List[int] = [1, 20, 60, 120, 240]
    symbols: Optional[List[str]] = None

class ScreeningColumnBase(BaseModel):
    indicator_type: str
    parameters: str # JSON string
    timeframe: Optional[str] = "D"
    color: Optional[str] = None

class ScreeningColumnCreate(ScreeningColumnBase):
    pass

class ScreeningColumn(ScreeningColumnBase):
    id: int
    sheet_id: int

    class Config:
        from_attributes = True

class ScreeningSheetBase(BaseModel):
    name: str

class ScreeningSheetCreate(ScreeningSheetBase):
    columns: List[ScreeningColumnCreate] = []

class ScreeningSheet(ScreeningSheetBase):
    id: int
    columns: List[ScreeningColumn] = []

    class Config:
        from_attributes = True

class DynamicScreeningRequest(BaseModel):
    list_id: int
    columns: List[TemplateIndicatorBase] # Reusing TemplateIndicatorBase as it has the structure we need
    symbols: Optional[List[str]] = None

class OrphanIndicator(BaseModel):
    indicator_key: str
    count: int

class DeleteOrphansRequest(BaseModel):
    indicator_keys: List[str]

# --- Drawing & Alarm Schemas ---

class AlarmBase(BaseModel):
    is_active: int = 1
    trigger_type: str = "close" # close, intraday

class AlarmCreate(AlarmBase):
    pass

class Alarm(AlarmBase):
    id: int
    drawing_id: int
    triggered_at: Optional[datetime] = None
    last_checked_price: Optional[float] = None

    class Config:
        from_attributes = True

class DrawingPoint(BaseModel):
    time: Union[str, int] # string representation or logical index
    price: float

class DrawingOut(BaseModel):
    id: int
    symbol: str
    type: str
    points: List[DrawingPoint]
    color: str
    line_width: float
    text: Optional[str] = None

    @field_validator('points', mode='before')
    @classmethod
    def parse_points(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except:
                return []
        return v
    
    class Config:
        from_attributes = True

class AlarmOut(Alarm):
    drawing: Optional[DrawingOut] = None

class DrawingBase(BaseModel):
    type: str
    points: List[DrawingPoint]
    color: str
    line_width: float
    text: Optional[str] = None

class DrawingCreate(DrawingBase):
    pass

class Drawing(DrawingBase):
    id: int
    symbol: str
    alarms: List[Alarm] = []

    @field_validator('points', mode='before')
    @classmethod
    def parse_points(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except:
                return []
        return v

    class Config:
        from_attributes = True

class DrawingSync(DrawingBase):
    id: Optional[int] = None # For local migration
    symbol: str

    @field_validator('points', mode='before')
    @classmethod
    def parse_points(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except:
                return []
        return v

class FundamentalDataBase(BaseModel):
    symbol: str
    market_cap: Optional[float] = None
    pe_ratio: Optional[float] = None
    forward_pe: Optional[float] = None
    ps_ratio: Optional[float] = None
    pb_ratio: Optional[float] = None
    dividend_yield: Optional[float] = None
    beta: Optional[float] = None
    total_revenue: Optional[float] = None
    revenue_growth: Optional[float] = None
    gross_margins: Optional[float] = None
    ebitda_margins: Optional[float] = None
    operating_margins: Optional[float] = None
    profit_margins: Optional[float] = None
    total_cash: Optional[float] = None
    total_debt: Optional[float] = None
    current_ratio: Optional[float] = None
    sector: Optional[str] = None
    industry: Optional[str] = None
    long_business_summary: Optional[str] = None
    last_updated: Optional[datetime] = None

class FundamentalData(FundamentalDataBase):
    id: int
    raw_info: Optional[str] = None

    class Config:
        from_attributes = True

class FundamentalUpdate(BaseModel):
    symbol: str

class TickerMappingBase(BaseModel):
    symbol_yahoo: str
    symbol_investing: str
    name: Optional[str] = None

class TickerMappingCreate(TickerMappingBase):
    pass

class TickerMapping(TickerMappingBase):
    id: int
    last_updated: datetime

    class Config:
        from_attributes = True

class PortfolioURLBase(BaseModel):
    name: str
    url: str

class PortfolioURLCreate(PortfolioURLBase):
    pass

class PortfolioURL(PortfolioURLBase):
    id: int
    last_updated: datetime

    class Config:
        from_attributes = True

# --- Portfolio Tracking Schemas ---

class CommissionPlanBase(BaseModel):
    name: str
    type: str  # 'absolute' or 'percentage'
    fixed_fee: float = 0.0
    percentage: float = 0.0
    min_fee: float = 0.0
    max_fee: Optional[float] = None
    currency: str = "EUR"

class CommissionPlanCreate(CommissionPlanBase):
    pass

class CommissionPlan(CommissionPlanBase):
    id: int

    class Config:
        from_attributes = True

class TransactionBase(BaseModel):
    portfolio_id: Optional[int] = None
    ticker: Optional[str] = None
    type: str
    date: datetime
    quantity: float
    price: float
    instrument_currency: str = "EUR"
    exchange_rate: float = 1.0
    commission_plan_id: Optional[int] = None
    commission_paid: float = 0.0
    short_borrow_fee_rate: float = 0.0

class TransactionCreate(TransactionBase):
    pass

class Transaction(TransactionBase):
    id: int

    class Config:
        from_attributes = True

class PortfolioBase(BaseModel):
    name: str
    base_currency: str = "EUR"
    cash_balance: float = 0.0

class PortfolioCreate(PortfolioBase):
    pass

class Portfolio(PortfolioBase):
    id: int
    transactions: List[Transaction] = []

    class Config:
        from_attributes = True
