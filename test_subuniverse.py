import urllib.request
import json

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

def test_subuniverse():
    # 1. Get lists to find a valid list_id
    lists = call_api("/lists/")
    if not lists:
        print("No lists found. Please create one.")
        return
    
    list_id = lists[0]['id']
    tickers = [t['symbol'] for t in lists[0]['tickers']]
    
    if len(tickers) < 1:
        print("Not enough tickers in list for test.")
        return

    subset = [tickers[0]]
    print(f"Testing with list_id={list_id}, subset={subset}")

    # 2. Test /screening/run with subset
    payload = {
        "list_id": list_id,
        "roc_periods": [1, 20, 60],
        "symbols": subset
    }
    results = call_api("/screening/run", "POST", payload)
    if results is None: return
    
    returned_symbols = [r['symbol'] for r in results]
    print(f"/screening/run returned symbols: {returned_symbols}")
    if set(returned_symbols) == set(subset):
        print("✅ /screening/run subset filtering works!")
    else:
        print("❌ /screening/run subset filtering failed!")

    # 3. Test /screening/run-dynamic with subset
    payload_dynamic = {
        "list_id": list_id,
        "columns": [
            {"indicator_type": "sma", "parameters": json.dumps({"length": 20}), "timeframe": "D"}
        ],
        "symbols": subset
    }
    results_dyn = call_api("/screening/run-dynamic", "POST", payload_dynamic)
    if results_dyn is None: return
    
    returned_symbols_dyn = [r['symbol'] for r in results_dyn]
    print(f"/screening/run-dynamic returned symbols: {returned_symbols_dyn}")
    if set(returned_symbols_dyn) == set(subset):
        print("✅ /screening/run-dynamic subset filtering works!")
    else:
        print("❌ /screening/run-dynamic subset filtering failed!")

if __name__ == "__main__":
    test_subuniverse()
