import re

with open('static/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

lines = content.split('\n')
sub_content = '\n'.join(lines[87:296]) # lines 88 to 296

# Remove comments
sub_content = re.sub(r'<!--.*?-->', '', sub_content, flags=re.DOTALL)
tag_regex = re.compile(r'<(/?[a-zA-Z0-9\-:]+)(?:\s+[^>]*?)?>')

stack = []
self_closing = {'img', 'br', 'hr', 'input', 'link', 'meta', 'base'}

print("--- Opening and Closing tag match trace ---")
for match in tag_regex.finditer(sub_content):
    tag = match.group(1).lower()
    full_match = match.group(0)
    
    # Calculate absolute line number
    pre_content = content[:content.find(sub_content) + match.start()]
    line = len(pre_content.split('\n'))
    
    if tag.startswith('/'):
        closing_name = tag[1:]
        if closing_name in self_closing:
            continue
        if len(stack) > 0:
            op_name, op_line, op_id, op_class = stack.pop()
            print(f"Line {line:3d}: </{closing_name}> matches <{op_name} id='{op_id}' class='{op_class}'> from line {op_line}")
        else:
            print(f"Line {line:3d}: </{closing_name}> BUT STACK IS EMPTY!")
    else:
        if tag in self_closing or full_match.endswith('/>'):
            continue
        id_match = re.search(r'id=["\'](.*?)["\']', full_match)
        div_id = id_match.group(1) if id_match else None
        class_match = re.search(r'class=["\'](.*?)["\']', full_match)
        div_class = class_match.group(1) if class_match else None
        
        stack.append((tag, line, div_id, div_class))
        print(f"Line {line:3d}: OPEN <{tag} id='{div_id}' class='{div_class}'>")
