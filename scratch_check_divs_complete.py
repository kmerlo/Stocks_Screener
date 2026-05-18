import re

with open('static/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

content = re.sub(r'<!--.*?-->', '', content, flags=re.DOTALL)
tag_regex = re.compile(r'<(/?[a-zA-Z0-9\-:]+)(?:\s+[^>]*?)?>')

def get_line_col(index):
    lines = content[:index].split('\n')
    return len(lines), len(lines[-1]) + 1

stack = []
self_closing = {'img', 'br', 'hr', 'input', 'link', 'meta', 'base'}

target_ids = {
    'main-content', 'monitoring-view', 'lists-view', 'screening-view',
    'historical-view', 'maintenance-view', 'gsheet-view', 'investing-view',
    'portfolio-view', 'alarms-view', 'configuration-view'
}

print("--- Complete Tracing of all view containers and main-content ---")
for match in tag_regex.finditer(content):
    tag = match.group(1).lower()
    full_match = match.group(0)
    line, col = get_line_col(match.start())
    
    if tag == 'div':
        if full_match.endswith('/>'):
            continue
        id_match = re.search(r'id=["\'](.*?)["\']', full_match)
        div_id = id_match.group(1) if id_match else None
        class_match = re.search(r'class=["\'](.*?)["\']', full_match)
        div_class = class_match.group(1) if class_match else None
        
        stack.append(('div', line, col, div_id, div_class))
        if div_id in target_ids:
            print(f"Line {line}: OPEN div id='{div_id}' (Stack depth: {len(stack)})")
    elif tag == '/div':
        if len(stack) > 0:
            name, op_line, op_col, div_id, div_class = stack.pop()
            if div_id in target_ids:
                print(f"Line {line}: CLOSE div id='{div_id}' (opened line {op_line}) (Stack depth: {len(stack)})")
        else:
            print(f"Line {line}: CLOSE div but stack is empty!")
