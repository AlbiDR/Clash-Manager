-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(12);

-- Writes are read from this transaction's own table statistics, so "nothing
-- rewritten" is measured directly rather than inferred from timestamps, which
-- now() pins for the whole transaction anyway.
CREATE TEMP TABLE gate_counts (
  ordinal integer PRIMARY KEY,
  step text NOT NULL UNIQUE,
  raw_war_log_ins bigint,
  war_history_writes bigint,
  war_history_upd bigint,
  raw_clan_profile_ins bigint,
  clans_writes bigint,
  clans_upd bigint
);

CREATE TEMP VIEW gate_now AS
SELECT
  COALESCE(sum(n_tup_ins) FILTER (WHERE relid = 'substrate.raw_war_log'::regclass), 0) AS raw_war_log_ins,
  COALESCE(sum(n_tup_ins + n_tup_upd) FILTER (WHERE relid = 'drivers.war_history'::regclass), 0) AS war_history_writes,
  COALESCE(sum(n_tup_upd) FILTER (WHERE relid = 'drivers.war_history'::regclass), 0) AS war_history_upd,
  COALESCE(sum(n_tup_ins) FILTER (WHERE relid = 'substrate.raw_clan_profile'::regclass), 0) AS raw_clan_profile_ins,
  COALESCE(sum(n_tup_ins + n_tup_upd) FILTER (WHERE relid = 'drivers.clans'::regclass), 0) AS clans_writes,
  COALESCE(sum(n_tup_upd) FILTER (WHERE relid = 'drivers.clans'::regclass), 0) AS clans_upd
FROM pg_stat_xact_user_tables;

-- Each step's writes, relative to the step before it.
CREATE TEMP VIEW gate_steps AS
SELECT step,
  raw_war_log_ins - lag(raw_war_log_ins) OVER w AS raw_war_log_ins,
  war_history_writes - lag(war_history_writes) OVER w AS war_history_writes,
  war_history_upd - lag(war_history_upd) OVER w AS war_history_upd,
  raw_clan_profile_ins - lag(raw_clan_profile_ins) OVER w AS raw_clan_profile_ins,
  clans_writes - lag(clans_writes) OVER w AS clans_writes,
  clans_upd - lag(clans_upd) OVER w AS clans_upd
FROM gate_counts
WINDOW w AS (ORDER BY ordinal);

INSERT INTO gate_counts SELECT 1, 'start', * FROM gate_now;

-- War log: stored once, skipped while identical, stored again once it changes.
SELECT public.ingest_raw_war_log('#Q0G0G0G0',
  '{"items": [{"seasonId": 999, "sectionIndex": 0, "standings": [{"rank": 1, "clan": {"tag": "#Q0G0G0G0", "name": "Gate Probe", "fame": 100, "clanScore": 1000, "participants": []}}]}]}');
INSERT INTO gate_counts SELECT 2, 'war_first', * FROM gate_now;

-- Same response with its keys in another order: equal as jsonb.
SELECT public.ingest_raw_war_log('#Q0G0G0G0',
  '{"items": [{"standings": [{"clan": {"participants": [], "clanScore": 1000, "fame": 100, "name": "Gate Probe", "tag": "#Q0G0G0G0"}, "rank": 1}], "sectionIndex": 0, "seasonId": 999}]}');
INSERT INTO gate_counts SELECT 3, 'war_same', * FROM gate_now;

SELECT public.ingest_raw_war_log('#Q0G0G0G0',
  '{"items": [{"seasonId": 999, "sectionIndex": 0, "standings": [{"rank": 1, "clan": {"tag": "#Q0G0G0G0", "name": "Gate Probe", "fame": 200, "clanScore": 1000, "participants": []}}]}]}');
INSERT INTO gate_counts SELECT 4, 'war_changed', * FROM gate_now;

SELECT is((SELECT raw_war_log_ins FROM gate_steps WHERE step = 'war_first'), 1::bigint,
  'the first war log response is stored');
SELECT is((SELECT raw_war_log_ins FROM gate_steps WHERE step = 'war_same'), 0::bigint,
  'an identical war log response stores no row');
SELECT is((SELECT war_history_writes FROM gate_steps WHERE step = 'war_same'), 0::bigint,
  'an identical war log response rewrites no war history');
SELECT is((SELECT raw_war_log_ins FROM gate_steps WHERE step = 'war_changed'), 1::bigint,
  'a changed war log response is stored');
SELECT is((SELECT war_history_upd FROM gate_steps WHERE step = 'war_changed'), 1::bigint,
  'a changed war log response is shredded into war history');

-- Clan profile: the same rule.
SELECT public.ingest_raw_clan_profile('#Q0G0G0G0',
  '{"tag": "#Q0G0G0G0", "name": "Gate Probe", "type": "open", "members": 1, "requiredTrophies": 0, "clanWarTrophies": 0}');
INSERT INTO gate_counts SELECT 5, 'profile_first', * FROM gate_now;

SELECT public.ingest_raw_clan_profile('#Q0G0G0G0',
  '{"tag": "#Q0G0G0G0", "name": "Gate Probe", "type": "open", "members": 1, "requiredTrophies": 0, "clanWarTrophies": 0}');
INSERT INTO gate_counts SELECT 6, 'profile_same', * FROM gate_now;

SELECT public.ingest_raw_clan_profile('#Q0G0G0G0',
  '{"tag": "#Q0G0G0G0", "name": "Gate Probe", "type": "open", "members": 2, "requiredTrophies": 0, "clanWarTrophies": 0}');
INSERT INTO gate_counts SELECT 7, 'profile_changed', * FROM gate_now;

SELECT is((SELECT raw_clan_profile_ins FROM gate_steps WHERE step = 'profile_first'), 1::bigint,
  'the first clan profile response is stored');
SELECT ok((SELECT raw_clan_profile_ins = 0 AND clans_writes = 0 FROM gate_steps WHERE step = 'profile_same'),
  'an identical clan profile response stores nothing and rewrites no clan row');
SELECT ok((SELECT raw_clan_profile_ins = 1 AND clans_upd = 1 FROM gate_steps WHERE step = 'profile_changed'),
  'a changed clan profile response is stored and shredded');

-- Retention: age only the probe rows past a window no real row can reach.
UPDATE substrate.raw_war_log SET ingested_at = now() - interval '10 years' WHERE clan_tag = '#Q0G0G0G0';
UPDATE substrate.raw_clan_profile SET ingested_at = now() - interval '10 years' WHERE clan_tag = '#Q0G0G0G0';
INSERT INTO substrate.raw_river_race (clan_tag, payload, ingested_at)
VALUES ('#Q0G0G0G0', '{}', now() - interval '10 years');

SELECT substrate.purge_raw_logs(24 * 365 * 5);

SELECT ok(
  (SELECT count(*) = 1 AND bool_and(payload #>> '{items,0,standings,0,clan,fame}' = '200')
   FROM substrate.raw_war_log WHERE clan_tag = '#Q0G0G0G0'),
  'retention keeps only the newest war log row of a clan, however old'
);
SELECT ok(
  (SELECT count(*) = 1 AND bool_and(payload ->> 'members' = '2')
   FROM substrate.raw_clan_profile WHERE clan_tag = '#Q0G0G0G0'),
  'retention keeps only the newest clan profile row of a clan, however old'
);
SELECT is(
  (SELECT count(*) FROM substrate.raw_river_race WHERE clan_tag = '#Q0G0G0G0'), 0::bigint,
  'ungated raw tables still expire purely by age'
);

INSERT INTO gate_counts SELECT 8, 'purged', * FROM gate_now;
SELECT public.ingest_raw_war_log('#Q0G0G0G0',
  '{"items": [{"seasonId": 999, "sectionIndex": 0, "standings": [{"rank": 1, "clan": {"tag": "#Q0G0G0G0", "name": "Gate Probe", "fame": 200, "clanScore": 1000, "participants": []}}]}]}');
INSERT INTO gate_counts SELECT 9, 'war_after_purge', * FROM gate_now;

SELECT is((SELECT raw_war_log_ins FROM gate_steps WHERE step = 'war_after_purge'), 0::bigint,
  'an unchanged war log is still skipped after retention ran');

SELECT * FROM finish();
ROLLBACK;
