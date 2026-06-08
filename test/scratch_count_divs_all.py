import re

with open('static/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

lines = content.split('\n')
sub_content = '\n'.join(lines[:296]) # lines 1 to 296

# Remove comments
sub_content = re.sub(r'<!--.*?-->', '', sub_content, flags=re.DOTALL)
tag_regex = re.compile(r'<(/?[a-zA-Z0-9\-:]+)(?:\s+[^>]*?)?>')

stack = []
self_closing = {'img', 'br', 'hr', 'input', 'link', 'meta', 'base'}

print("--- Counting all tags from line 1 to 296 ---")
for match in tag_regex.finditer(sub_content):
    tag = match.group(1).lower()
    full_match = match.group(0)
    
    pre_content = content[:match.start()]
    line = len(pre_content.split('\n'))
    
    if tag.startswith('/'):
        closing_name = tag[1:]
        if closing_name in self_closing:
            continue
        
        # Pop
        if len(stack) > 0:
            op_name, op_line, op_id = stack.pop()
            if op_id in ['main-content', 'monitoring-view', 'lists-view', 'screening-view', 'portfolio-view', 'configuration-view'] or closing_name == 'div':
                pass
        else:
            print(f"Line {line}: </{closing_name}> but stack is empty!")
    else:
        if tag in self_closing or full_match.endswith('/>'):
            continue
        id_match = re.search(r'id=["\'](.*?)["\']', full_match)
        div_id = id_match.group(1) if id_match else None
        stack.append((tag, line, div_id))

print(f"\nRemaining unclosed tags on stack at line 296:")
for item in stack:
    print(f"  <{item[0]} id='{item[2]}'> opened at line {item[1]}")
