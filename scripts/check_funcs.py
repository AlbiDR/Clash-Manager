import re

with open('Backend/supabase/migrations/20260531232406_master_migration.sql', 'r') as f:
    content = f.read()

# Find all functions
func_pattern = re.compile(r'CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([\w\.]+)\s*\(', re.IGNORECASE)

for match in func_pattern.finditer(content):
    func_name = match.group(1)
    start_pos = match.start()

    # Find the matching closing parenthesis for arguments
    paren_count = 0
    pos = match.end() - 1
    found_args_end = False
    while pos < len(content):
        if content[pos] == '(':
            paren_count += 1
        elif content[pos] == ')':
            paren_count -= 1
            if paren_count == 0:
                args_end = pos + 1
                found_args_end = True
                break
        pos += 1

    if not found_args_end:
        continue

    # Now look for AS
    as_match = re.search(r'\bAS\b', content[args_end:], re.IGNORECASE)
    if as_match:
        header = content[args_end:args_end + as_match.start()]
        if 'search_path' not in header.lower():
            # Check if it's a trigger function or something that might not need it?
            # Actually ALL custom functions should have it.
            print(f"Function {func_name} at line {content.count('\n', 0, match.start()) + 1} is missing SET search_path")
