# Stocks Screener

A financial analysis and portfolio management tool with support for technical analysis, fundamental analysis, screening, and portfolio tracking.

## 🚀 Quick Start

### Prerequisites
- Python 3.11+
- [uv](https://docs.astral.sh/uv/) (Python package installer)
- Git (for version control)

### Installation
```bash
# Clone the repository
git clone <repository-url>
cd Stocks_Screener

# Install dependencies
uv sync

# Initialize the databases (creates config.db and market.db)
uv run python -c "from database import init_db; init_db()"

# Start the development server
uv run uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

The application will be available at http://localhost:8000

## 📁 Database Architecture

Starting from version 2.0, the application uses a split database architecture for better data management:

### 1. `config.db` (User Configuration - **Versioned**)
- **Purpose**: Stores user-specific configuration data
- **Size**: Typically < 1 MB
- **Git Status**: **Tracked and versioned** (should be committed to your repository)
- **Contains**:
  - User lists and tickers
  - Portfolios and transactions
  - Drawings and alarms on charts
  - Screening sheet configurations
  - Broker, commission, and tax plan configurations
  - Ticker mappings (Yahoo ↔ Investing.com)
  - Chart templates and indicators

### 2. `market.db` (Market Data - **Not Versioned**)
- **Purpose**: Stores market data retrieved from internet sources
- **Size**: Can grow large (50-200+ MB depending on data history)
- **Git Status**: **Ignored** (not committed to repository)
- **Contains**:
  - Price data (OHLCV) from yfinance
  - Fundamental data (P/E, market cap, etc.) from yfinance
  - Historical fundamental data (quarterly)
  - Calculated screening values (technical indicators)

## 🔧 Environment Variables

You can customize the database locations using environment variables:

```bash
# Default locations (used if not set)
CONFIG_DATABASE_URL="sqlite:///./config.db"
MARKET_DATABASE_URL="sqlite:///./market.db"

# Example: Using different locations
CONFIG_DATABASE_URL="sqlite:///./data/config.db" \
MARKET_DATABASE_URL="sqlite:///./data/market.db" \
uv run uvicorn main:app --host 0.0.0.0 --port 8000
```

## 🔄 Migration from Existing Installation

If you're upgrading from a version prior to 2.0 that used a single `finance_app.db`:

1. **Backup your existing database**:
   ```bash
   cp finance_app.db finance_app.db.backup
   ```

2. **Run the migration script** (one-time):
   ```bash
   uv run python migrate_split_db.py
   ```
   This will:
   - Create `config.db` with all user data
   - Create `market.db` with all market data
   - Rename your original `finance_app.db` to `finance_app.db.migrated.bak` (keep as backup)

3. **Verify the migration** worked correctly by checking the file sizes:
   - `config.db` should be small (< 1 MB)
   - `market.db` should contain the bulk of the data
   - The migrated backup should be approximately the same size as your original

4. **Update your .gitignore** (if not already done):
   ```bash
   # Add these lines to your .gitignore
   finance_app.db*
   market.db*
   ```
   And ensure `config.db` is NOT in your .gitignore (it should be versioned).

5. **Commit your config.db** to Git:
   ```bash
   git add config.db
   git commit -m "Add user configuration database"
   ```

## 💡 Workflow Tips

### Development
- The `config.db` file should be committed regularly as you make changes to your lists, portfolios, etc.
- The `market.db` file should never be committed as it can be regenerated from internet sources
- Use the provided `/admin/git-commit` endpoint to easily commit your configuration:
  ```bash
  curl -X POST http://localhost:8000/admin/git-commit
  ```
  Or with a custom message:
  ```bash
  curl -X POST "http://localhost:8000/admin/git-commit?message=My%20custom%20commit%20message"
  ```

### Backup & Recovery
- **To backup**: Simply copy your `config.db` file (it's small and contains all your important data)
- **To recover on a new machine**:
  1. Clone the repository
  2. Copy your backed-up `config.db` to the project directory
  3. Run `uv sync`
  4. Start the application - `market.db` will be created automatically as needed
  5. Use the UI to load/download any needed market data

### Data Regeneration
All data in `market.db` can be regenerated from internet sources:
- Price data: Downloaded automatically when viewing charts or running screenings
- Fundamental data: Retrieved on-demand when viewing stock fundamentals
- Screening values: Calculated automatically when running screenings
- If you need to clear old data, simply delete `market.db` and restart the application

## 📚 API Documentation

Once the server is running, visit:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## 🛠️ Available Endpoints

### Configuration Endpoints (use config.db)
- `GET/POST /lists/` - Manage ticker lists
- `GET/POST /lists/{id}/tickers/` - Manage tickers in lists
- `GET/POST /portfolios/` - Manage portfolios
- `GET/POST /portfolios/{id}/transactions/` - Manage portfolio transactions
- `GET/POST /brokers/` - Manage brokers
- `GET/POST /tax_plans/` - Manage tax plans
- `GET/POST /commission_plans/` - Manage commission plans
- `GET/POST /tickers/mapping/` - Manage ticker mappings
- `GET/POST /investing/urls/` - Manage portfolio import URLs
- `GET/POST /screening/sheets/` - Manage screening sheets
- `GET/POST /screening/columns/` - Manage screening columns

### Market Data Endpoints (use market.db)
- `GET /ticker_price` - Get historical price for a ticker
- `GET/POST /tickers/{symbol}/fundamentals/` - Get/update fundamental data
- `GET /tickers/{symbol}/fundamentals/historical` - Get historical fundamental data
- `POST /screening/run` - Run modular screening
- `POST /screening/run-dynamic` - Run dynamic screening

### Administrative Endpoints
- `POST /admin/git-commit` - Commit config.db to Git repository

## ⚠️ Important Notes

1. **Never commit market.db** - it contains regenerable data and can become very large
2. **Always backup config.db** - it contains your irreplaceable user data
3. **The split is transparent** - your existing workflows continue to work unchanged
4. **Performance** - database operations are faster due to smaller, more focused databases
5. **Git integration** - easily version your configuration changes with the provided commit endpoint

## 📝 Changelog

### Version 2.0.0
- Split single database into `config.db` (user data) and `market.db` (market data)
- Added environment variable support for database locations
- Added `/admin/git-commit` endpoint for easy version control
- Updated documentation and migration tools
- Maintained full backward compatibility for all API endpoints

## 🙏 Support

For issues, questions, or contributions, please open an issue on the GitHub repository.

---

**Happy investing and screening!** 📈