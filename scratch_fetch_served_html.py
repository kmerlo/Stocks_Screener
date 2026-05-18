import urllib.request

try:
    url = "http://localhost:8000/"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as response:
        html = response.read().decode('utf-8')
    
    lines = html.split('\n')
    print(f"Served HTML total lines: {len(lines)}")
    print("--- Lines 290 to 305 of served HTML ---")
    for i in range(289, min(305, len(lines))):
        print(f"{i+1:3d}: {lines[i]}")
except Exception as e:
    print(f"Error fetching served HTML: {e}")
