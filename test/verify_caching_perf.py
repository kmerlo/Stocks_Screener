import urllib.request
import json
import time

BASE_URL = "http://localhost:8000"

def call_api(path, method='GET', data=None):
    url = f"{BASE_URL}{path}"
    headers = {'Content-Type': 'application/json'}
    req_data = json.dumps(data).encode('utf-8') if data else None
    
    req = urllib.request.Request(url, data=req_data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode('utf-8'))
    except Exception as e:
        print(f"Error calling {url}: {e}")
        return None

def test_performance():
    # 1. Get info
    lists = call_api("/lists/")
    if not lists: return
    # Find list 7 if possible, or use the one with most tickers
    list_to_use = None
    for l in lists:
        if l['id'] == 7:
            list_to_use = l
            break
    if not list_to_use:
        list_to_use = max(lists, key=lambda x: len(x.get('tickers', [])))
    
    list_id = list_to_use['id']
    ticker_count = len(list_to_use.get('tickers', []))
    print(f"Using list {list_id} ('{list_to_use['name']}') with {ticker_count} tickers.")
    
    # 2. Run first time (ensure cached)
    print("Running initial screening (warming cache)...")
    payload = {"list_id": list_id, "roc_periods": [1, 20, 60, 120, 240]}
    call_api("/screening/run", "POST", payload)
    
    # 3. Time the second run
    print("Running second screening (should be from cache)...")
    start = time.time()
    call_api("/screening/run", "POST", payload)
    end = time.time()
    
    print(f"Time for cached screening: {end - start:.4f} seconds")
    if end - start < 1.0:
        print("✅ PERFORMANCE OK: Sub-second response for cached data!")
    else:
        print("❌ PERFORMANCE SLOW: Response took more than 1 second.")

if __name__ == "__main__":
    test_performance()
