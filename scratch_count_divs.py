import re

with open('static/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# We only care about the lines between 88 and 296
lines = content.split('\n')
sub_content = '\n'.join(lines[87:296]) # lines 88 to 296 (0-indexed: 87 to 295)

# Remove comments
sub_content = re.sub(r'<!--.*?-->', '', sub_content, flags=re.DOTALL)
tag_regex = re.compile(r'<(/?[a-zA-Z0-9\-:]+)(?:\s+[^>]*?)?>')

stack = []
self_closing = {'img', 'br', 'hr', 'input', 'link', 'meta', 'base'}

print("--- Counting all opening and closing tags in monitoring-view (lines 88-296) ---")
for match in tag_regex.finditer(sub_content):
    tag = match.group(1).lower()
    full_match = match.group(0)
    
    # Calculate line number relative to main file
    pre_content = content[:content.find(sub_content) + match.start()]
    line = len(pre_content.split('\n'))
    
    if tag.startswith('/'):
        closing_name = tag[1:]
        if closing_name in self_closing:
            continue
        
        # Pop
        if len(stack) > 0:
            op_name, op_line, op_id = stack.pop()
            print(f"Line {line}: </{closing_name}> closes <{op_name} id='{op_id}'> from line {op_line}")
        else:
            print(f"Line {line}: </{closing_name}> but stack is empty!")
    else:
        if tag in self_closing or full_match.endswith('/>'):
            continue
        id_match = re.search(r'id=["\'](.*?)["\']', full_match)
        div_id = id_match.group(1) if id_match else None
        stack.append((tag, line, div_id))
        print(f"Line {line}: OPEN <{tag} id='{div_id}'>")

print(f"\nRemaining unclosed tags on stack: {stack}")
