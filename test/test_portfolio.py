import requests
import json
from datetime import datetime

BASE_URL = "http://localhost:8000"

def run_tests():
    print("--- Starting Portfolio API Tests ---")
    
    # 1. Create Portfolio
    port_data = {"name": f"Test Portfolio FX {datetime.now().timestamp()}", "base_currency": "EUR", "cash_balance": 0.0}
    r = requests.post(f"{BASE_URL}/portfolios/", json=port_data)
    if r.status_code != 200:
        print("Failed to create portfolio:", r.text)
        return
    portfolio_id = r.json()["id"]
    print(f"Created Portfolio ID: {portfolio_id}")

    # 2. Deposit Cash via Transaction
    cash_data = {"portfolio_id": portfolio_id, "ticker": "CASH", "type": "DEPOSIT", "date": "2023-01-01", "quantity": 10000.0, "price": 1.0, "instrument_currency": "EUR"}
    r = requests.post(f"{BASE_URL}/portfolios/{portfolio_id}/transactions/", json=cash_data)
    print("Deposited 10k EUR:", r.status_code)
    if r.status_code != 200:
        print("Error:", r.text)

    # 3. Create Commission Plan
    plan_data = {
        "name": f"Fineco Test {datetime.now().timestamp()}",
        "type": "percentage",
        "percentage": 0.19,
        "min_fee": 2.95,
        "max_fee": 19.0,
        "currency": "EUR"
    }
    r = requests.post(f"{BASE_URL}/commission_plans/", json=plan_data)
    if r.status_code != 200:
        print("Failed to create plan:", r.text)
        return
    plan_id = r.json()["id"]
    print(f"Created Commission Plan ID: {plan_id}")

    # 4. Add Transaction (Buy AAPL in USD)
    txn_data = {
        "portfolio_id": portfolio_id,
        "ticker": "AAPL",
        "type": "BUY",
        "date": "2023-01-03", 
        "quantity": 10.0,
        "price": 130.0,
        "instrument_currency": "USD",
        "commission_plan_id": plan_id
    }
    r = requests.post(f"{BASE_URL}/portfolios/{portfolio_id}/transactions/", json=txn_data)
    print("Add AAPL Buy Transaction:", r.status_code)
    if r.status_code != 200:
        print("Error:", r.text)

    # 5. Add Transaction (Short TSLA in USD)
    txn_data_short = {
        "portfolio_id": portfolio_id,
        "ticker": "TSLA",
        "type": "SHORT",
        "date": "2024-01-02",
        "quantity": 5.0,
        "price": 248.0,
        "instrument_currency": "USD",
        "commission_plan_id": plan_id,
        "short_borrow_fee_rate": 0.05
    }
    r = requests.post(f"{BASE_URL}/portfolios/{portfolio_id}/transactions/", json=txn_data_short)
    print("Add TSLA Short Transaction:", r.status_code)
    if r.status_code != 200:
        print("Error:", r.text)

    # 6. Get Summary
    r = requests.get(f"{BASE_URL}/portfolios/{portfolio_id}/summary")
    print("Portfolio Summary:", r.status_code)
    if r.status_code == 200:
        print(json.dumps(r.json(), indent=2))
        
if __name__ == "__main__":
    run_tests()
