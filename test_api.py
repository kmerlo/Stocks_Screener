import requests
import json

url = "http://127.0.0.1:8000/indicators/AAPL/calculate"
payload = [
    {
        "indicator_type": "SMA",
        "parameters": {"length": 20},
        "pane_index": 0
    }
]
headers = {"Content-Type": "application/json"}

try:
    response = requests.post(url, json=payload, headers=headers)
    print(f"Status: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
except Exception as e:
    print(f"Error: {e}")
