from bs4 import BeautifulSoup

with open('static/index.html', 'r', encoding='utf-8') as f:
    soup = BeautifulSoup(f.read(), 'html.parser')

views = [
    'monitoring-view', 'lists-view', 'screening-view', 'historical-view',
    'maintenance-view', 'gsheet-view', 'investing-view', 'portfolio-view',
    'alarms-view', 'configuration-view'
]

print("--- BeautifulSoup parent path for all views ---")
for view_id in views:
    el = soup.find(id=view_id)
    if el:
        path = []
        curr = el
        while curr:
            path.append(curr.name + (f"#{curr.get('id')}" if curr.get('id') else "") + (f".{'.'.join(curr.get('class'))}" if curr.get('class') else ""))
            curr = curr.parent
        path.reverse()
        print(f"{view_id:20s}: {' -> '.join(path)}")
    else:
        print(f"{view_id:20s}: NOT FOUND")
