import re

with open('static/index.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if 'class="view-container' in line or "class='view-container" in line or "id=" in line and "view" in line and "class=" in line and "view-container" in line:
        print(f"Line {i+1}: {line.strip()}")
