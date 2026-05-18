with open('static/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

in_tag = False
tag_start = 0

print("--- Scanning for mismatched brackets ---")
for idx, char in enumerate(content):
    if char == '<':
        if in_tag:
            lines = content[:tag_start].split('\n')
            print(f"Error: '<' found inside tag starting at line {len(lines)}")
        in_tag = True
        tag_start = idx
    elif char == '>':
        if not in_tag:
            lines = content[:idx].split('\n')
            print(f"Error: '>' found outside tag at line {len(lines)}: ...{content[max(0, idx-20):idx+20]}...")
        in_tag = False
