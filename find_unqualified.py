import re

with open('Backend/supabase/migrations/20260531232406_master_migration.sql', 'r') as f:
    content = f.read()

tables = [
    'raw_clan_profile', 'raw_clan_members', 'raw_river_race', 'raw_war_log',
    'config', 'governance_telemetry', 'discovery_cache', 'pipeline_heartbeat',
    'discovery_anchors', 'headhunter_epoch_state', 'players', 'clans',
    'members', 'war_activity', 'war_history', 'war_opponents', 'player_battles',
    'member_snapshots', 'recruits', 'recruit_blacklist', 'recruit_ledger',
    'heritage_ledger', 'push_subscriptions', 'clan_voyage',
    'clan_voyage_contributions', 'exclusion_cache', 'player_card_snapshots'
]

for table in tables:
    for match in re.finditer(r'\b' + table + r'\b', content):
        start = match.start()
        if start > 0 and content[start-1] == '.':
            continue

        line_start = content.rfind('\n', 0, start) + 1
        line_end = content.find('\n', start)
        if line_end == -1: line_end = len(content)
        line = content[line_start:line_end]

        if 'CREATE TABLE' in line or 'ALTER TABLE' in line or 'TABLE ' + table in line:
            continue
        if 'COMMENT ON' in line:
            continue
        if '--' in line and line.find('--') < line.find(table):
            continue
        if '/*' in line and line.find('/*') < line.find(table):
            continue
        if 'TYPE' in line and table in line: # e.g. drivers.members%ROWTYPE
            continue

        # Check if it's a CTE definition or usage
        if 'AS (' in line or 'WITH' in line:
            continue

        print(f"Potential unqualified table {table} at line {content.count('\n', 0, start) + 1}: {line.strip()}")
