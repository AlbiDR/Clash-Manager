import re

with open('Backend/supabase/migrations/20260531232406_master_migration.sql', 'r') as f:
    content = f.read()

lines = content.split('\n')

print("--- Checking for missing search_path in functions ---")
for i, line in enumerate(lines):
    if re.search(r'CREATE (OR REPLACE )?FUNCTION', line, re.IGNORECASE):
        found_search_path = False
        for j in range(i + 1, min(i + 20, len(lines))):
            if re.search(r'SET search_path', lines[j], re.IGNORECASE):
                found_search_path = True
                break
            if re.search(r'AS\s+\$', lines[j], re.IGNORECASE):
                break
        if not found_search_path:
            print(f"Line {i+1}: {line.strip()}")

print("\n--- Checking for CREATE TABLE without IF NOT EXISTS ---")
for i, line in enumerate(lines):
    if re.search(r'CREATE TABLE', line, re.IGNORECASE) and not re.search(r'IF NOT EXISTS', line, re.IGNORECASE):
        print(f"Line {i+1}: {line.strip()}")

print("\n--- Checking for CREATE INDEX without IF NOT EXISTS ---")
for i, line in enumerate(lines):
    if re.search(r'CREATE INDEX', line, re.IGNORECASE) and not re.search(r'IF NOT EXISTS', line, re.IGNORECASE):
        print(f"Line {i+1}: {line.strip()}")

print("\n--- Checking for missing RLS for tables ---")
tables = re.findall(r'CREATE TABLE IF NOT EXISTS ([\w\.]+)', content, re.IGNORECASE)
for table in tables:
    rls_pattern = rf'ALTER TABLE {re.escape(table)} ENABLE ROW LEVEL SECURITY'
    if not re.search(rls_pattern, content, re.IGNORECASE):
        print(f"Table {table} missing RLS")

print("\n--- Checking for em-dashes and emojis ---")
for i, line in enumerate(lines):
    if '—' in line:
        print(f"Line {i+1} has em-dash: {line.strip()}")
    # Simple emoji check (not exhaustive but covers common ones)
    if any(ord(char) > 0xFFFF for char in line):
        print(f"Line {i+1} has emoji/non-BMP char: {line.strip()}")
