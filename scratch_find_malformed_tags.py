import re

with open('static/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Find any < or > that might be part of a malformed tag
# For example, < followed by spaces, or > not matching <
# Let's check tag syntax
print("--- Checking for malformed or suspicious tags ---")
# Check for < followed by whitespace or invalid character
invalid_lt = re.finditer(r'<[^\w/!]', content)
for m in invalid_lt:
    start = max(0, m.start() - 20)
    end = min(len(content), m.end() + 20)
    print(f"Suspicious '<': ...{content[start:end]}...")

# Check for unclosed tags or tags with weird characters
# Let's count < and >
lt_count = content.count('<')
gt_count = content.count('>')
print(f"Number of '<': {lt_count}, Number of '>': {gt_count}")

if lt_count != gt_count:
    print("Warning: Count of '<' and '>' do not match!")
