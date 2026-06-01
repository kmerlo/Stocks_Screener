import yfinance as yf
import json

ticker = yf.Ticker("CRM")
info = ticker.info

print("Number of keys:", len(info))
# print keys and types and a sample value
for k, v in list(info.items())[:50]:
    print(f"{k}: {type(v).__name__} = {repr(v)[:100]}")
