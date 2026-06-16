import requests
import pandas as pd
import io
import time
from datetime import datetime, timedelta

MAX_RANGE_DAYS = 365


def _download_chunk(isin: str, mic: str, startdate: str, enddate: str,
                    lang: str, headers: dict) -> pd.DataFrame:
    url = f"https://live.euronext.com/{lang}/ajax/AwlHistoricalPrice/getFullDownloadAjax/{isin}-{mic}"

    params = {
        "format": "csv",
        "decimal_separator": ".",
        "date_form": "d/m/Y",
        "adjusted": "Y",
        "startdate": startdate,
        "enddate": enddate,
    }

    resp = requests.get(url, params=params, headers=headers, timeout=30)
    resp.raise_for_status()

    lines = resp.text.strip().splitlines()
    header_idx = next(i for i, line in enumerate(lines) if line.startswith("Date;"))
    header_line = lines[header_idx]
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

    return df


def _filter_closed_market(df: pd.DataFrame) -> pd.DataFrame:
    return df[df["Open"] != 0]


def _chunked_download(isin: str, mic: str,
                      range_start: datetime, range_end: datetime,
                      lang: str, headers: dict) -> pd.DataFrame:
    """Download data in 365-day chunks going backward from range_end to range_start."""
    chunks = []
    cursor = range_end
    while cursor > range_start:
        chunk_start = max(cursor - timedelta(days=MAX_RANGE_DAYS), range_start)
        df = _download_chunk(
            isin, mic,
            chunk_start.strftime("%Y-%m-%d"),
            cursor.strftime("%Y-%m-%d"),
            lang, headers,
        )
        if not df.empty:
            chunks.append(df)
        elif chunks:
            break
        cursor = chunk_start
        time.sleep(0.5)

    if not chunks:
        return pd.DataFrame()

    result = pd.concat(chunks, ignore_index=True)
    result = result.set_index("Date")
    result.index = pd.to_datetime(result.index)
    result = result.sort_index()
    return _filter_closed_market(result)


def download_euronext_csv(isin: str, mic: str = "ETLX",
                          startdate: str = None, enddate: str = None,
                          lang: str = "en", years: int = 1) -> pd.DataFrame:
    headers = {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
        "Accept": "text/csv,application/csv,*/*",
        "Referer": f"https://live.euronext.com/en/product/structured-products/{isin}-{mic}",
    }

    if startdate and enddate:
        range_start = datetime.strptime(startdate, "%Y-%m-%d")
        range_end = datetime.strptime(enddate, "%Y-%m-%d")
    else:
        range_end = datetime.now()
        range_start = range_end - timedelta(days=365 * years)

    return _chunked_download(isin, mic, range_start, range_end, lang, headers)
