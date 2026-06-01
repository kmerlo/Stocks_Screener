import yfinance as yf

ticker = yf.Ticker("CRM")
info = ticker.info

print("All keys:")
for k in sorted(info.keys()):
    v = info[k]
    print(f"- {k}: {type(v).__name__} = {repr(v)[:80]}")
