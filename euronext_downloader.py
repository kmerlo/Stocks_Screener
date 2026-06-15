import requests
import pandas as pd
import io
from datetime import datetime, timedelta


def download_euronext_csv(isin: str, mic: str = "ETLX",
                          startdate: str = None, enddate: str = None,
                          lang: str = "en") -> pd.DataFrame:
    if not enddate:
        enddate = datetime.now().strftime("%Y-%m-%d")
    if not startdate:
        startdate = (datetime.now() - timedelta(days=365)).strftime("%Y-%m-%d")

    url = f"https://live.euronext.com/{lang}/ajax/AwlHistoricalPrice/getFullDownloadAjax/{isin}-{mic}"

    params = {
        "format": "csv",
        "decimal_separator": ".",
        "date_form": "d/m/Y",
        "adjusted": "Y",
        "startdate": startdate,
        "enddate": enddate,
    }

    headers = {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
        "Accept": "text/csv,application/csv,*/*",
        "Referer": f"https://live.euronext.com/en/product/structured-products/{isin}-{mic}",
    }

    resp = requests.get(url, params=params, headers=headers, timeout=30)
    resp.raise_for_status()

    lines = resp.text.strip().splitlines()
    header_idx = next(i for i, line in enumerate(lines) if line.startswith("Date;"))
    header_line = lines[header_idx]
    # Remove last field from each data row (extra VWAP column not in header)
    data_lines = [line.rsplit(";", 1)[0] for line in lines[header_idx + 1:]]
    csv_text = header_line + "\n" + "\n".join(data_lines)

    df = pd.read_csv(
        io.StringIO(csv_text),
        sep=";",
        usecols=["Date", "Open", "High", "Low", "Close", "Last", "Number of Shares"],
        parse_dates=["Date"],
        dayfirst=True,
    )

    df = df.rename(columns={
        "Last": "Adj Close",
        "Number of Shares": "Volume",
    })

    df["Volume"] = pd.to_numeric(df["Volume"], errors="coerce").fillna(0).astype(int)
    df["Adj Close"] = pd.to_numeric(df["Adj Close"], errors="coerce")

    df = df.set_index("Date")
    df.index = pd.to_datetime(df.index)
    df = df.sort_index()

    return df
