import io
import csv

def parse_csv_tickers(csv_content: str):
    """Parses a CSV string with semicolon separator to extract tickers.
    Format: yahoo_ticker;name
    """
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

content = """QGEN.DE;Qiagen N.V.
RHM.DE;Rheinmetall AG
RWE.DE;RWE AG   
SAP.DE;SAP SE    
SIE.DE;Siemens AG
ENR.DE;Siemens Energy AG
SHL.DE;Siemens Healthineers AG
SY1.DE;Symrise AG
VOW3.DE;Volkswagen AG
VNA.DE;Vonovia SE    
ZAL.DE;Zalando SEl AG
DTG.DE;Daimler Truck Holding AG"""

try:
    data = parse_csv_tickers(content)
    print(f"Parsed {len(data)} tickers")
    for d in data:
        print(d)
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
