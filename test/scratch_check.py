from bs4 import BeautifulSoup

with open('static/index.html', 'r', encoding='utf-8') as f:
    soup = BeautifulSoup(f.read(), 'html.parser')

print("--- View Containers Nesting Paths ---")
views = soup.find_all(class_='view-container')
for v in views:
    path = []
    parent = v.parent
    while parent:
        parent_info = f"{parent.name}"
        if parent.get('id'):
            parent_info += f"#{parent.get('id')}"
        elif parent.get('class'):
            parent_info += f".{'.'.join(parent.get('class'))}"
        path.append(parent_info)
        parent = parent.parent
    print(f"View id='{v.get('id')}': parent path = {' -> '.join(reversed(path))}")
