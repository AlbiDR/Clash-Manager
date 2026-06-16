
import re
import os

BASELINE = 'Backend/supabase/migrations/20260531232406_master_migration.sql'

def audit():
    with open(BASELINE, 'r') as f:
        content = f.read()

    lines = content.split('\n')
    errors = []

    # 1. Check for missing search_path
    # We look for CREATE OR REPLACE FUNCTION and then check for SET search_path before the AS block
    func_pattern = re.compile(r'CREATE OR REPLACE FUNCTION ([\w\.]+)', re.IGNORECASE)
    as_pattern = re.compile(r'AS \$(?:function)?\$', re.IGNORECASE)
    search_path_pattern = re.compile(r'SET search_path', re.IGNORECASE)

    current_func = None
    func_start_line = 0
    in_func_header = False

    for i, line in enumerate(lines):
        m = func_pattern.search(line)
        if m:
            current_func = m.group(1)
            func_start_line = i + 1
            in_func_header = True
            has_search_path = False
            continue

        if in_func_header:
            if search_path_pattern.search(line):
                has_search_path = True
            if as_pattern.search(line):
                if not has_search_path:
                    errors.append(f"Function {current_func} at line {func_start_line} missing SET search_path")
                in_func_header = False
                current_func = None

    # 2. Check for CREATE TABLE without IF NOT EXISTS
    table_pattern = re.compile(r'CREATE TABLE (?!IF NOT EXISTS)([\w\.]+)', re.IGNORECASE)
    for i, line in enumerate(lines):
        # Ignore strings and comments
        if '--' in line: continue
        m = table_pattern.search(line)
        if m:
            # Check if it's inside a string (like in rls_auto_enable)
            if "'" in line or '"' in line: continue
            errors.append(f"Table {m.group(1)} at line {i+1} missing IF NOT EXISTS")

    # 3. Check for missing RLS
    tables = re.findall(r'CREATE TABLE IF NOT EXISTS ([\w\.]+)', content, re.IGNORECASE)
    for table in tables:
        # Ignore temp tables
        if 'elite_tags' in table: continue
        rls_pattern = rf'ALTER TABLE {re.escape(table)} ENABLE ROW LEVEL SECURITY'
        if not re.search(rls_pattern, content, re.IGNORECASE):
            errors.append(f"Table {table} missing RLS")

    # 4. Check for triggers without OR REPLACE
    trigger_pattern = re.compile(r'CREATE (?!OR REPLACE )TRIGGER', re.IGNORECASE)
    for i, line in enumerate(lines):
        if trigger_pattern.search(line):
            errors.append(f"Trigger at line {i+1} missing OR REPLACE")

    # 5. Check for em-dashes and emojis
    for i, line in enumerate(lines):
        if '—' in line:
            errors.append(f"Line {i+1} has em-dash")
        if any(ord(char) > 0xFFFF for char in line):
            errors.append(f"Line {i+1} has emoji/non-BMP char")

    # 6. Check for out-of-line UNIQUE constraints
    # (Actually we want to consolidate them if they exist, but we prefer in-line)
    if 'ALTER TABLE' in content and 'ADD CONSTRAINT' in content and 'UNIQUE' in content:
         errors.append("Found out-of-line UNIQUE constraints")

    # 7. Check for unqualified Moddatetime
    if re.search(r'EXECUTE FUNCTION moddatetime', content, re.IGNORECASE):
        errors.append("Unqualified moddatetime call found")

    return errors

if __name__ == "__main__":
    errs = audit()
    if errs:
        for e in errs:
            print(e)
    else:
        print("No errors found.")
