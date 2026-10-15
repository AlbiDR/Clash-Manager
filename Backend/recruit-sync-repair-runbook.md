<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->

# Recruit synchronization and rotation repair

## Scope and behavior

Migration `20261015202548_stabilize_recruit_sync_and_rotation.sql` replaces the
current `public.sync_recruits(jsonb)` and `substrate.rotate_recruits()` bodies.
It does not change table data, function signatures, role grants, schema
exposure, or the rotation guard table.

`sync_recruits` sorts both player and recruit upsert inputs by the same
bytewise `player_tag` order before PostgreSQL processes `ON CONFLICT` rows. Two
overlapping batches containing the same tags in opposite JSON order therefore
request those row locks in a consistent order. The function still upserts
players before recruits, preserves an existing recruit's `source`, counts only
changed recruit rows, rotates only when at least one recruit changed, and
increments or clears the transaction guard exactly as before.

`rotate_recruits` remains `SECURITY INVOKER`, postgres-owned, with its existing
ACL. It stores candidate tags in an invocation-local `text[]` instead of
dropping and recreating a session temporary table. Before candidate collection,
it requires `MAX_ACTIVE_RECRUITS` to exist as a non-negative integer; missing,
null, malformed, negative, and out-of-range values raise SQLSTATE `22023` with
a clear message. Zero remains valid, and values such as the live limit 250 are
honored without an extra cap. Ranking remains non-archived rows ordered by
`raw_potential_score DESC NULLS LAST`; the selected set is reused across the
existing bench and promote updates.

The existing `recruit_sync_rotation_guard` remains the protection against
duplicate trigger-driven rotations. The SQL regression test retains the
successful nested-depth and rollback assertions. It asserts sync is
postgres-owned `SECURITY DEFINER` and rotate is postgres-owned
`SECURITY INVOKER` with its original null ACL; sync remains service-role-only.
It preserves a caller-owned temp table named `elite_tags` through repeated
rotations, checks valid limit 250 and clear failure for missing or negative
configuration, and exercises a top-two boundary with null-score and archived
rows.

## Verification

Run the focused pgTAP file against a disposable local database after applying
the tracked migration sequence, including the new migration. Set
`LOCAL_DATABASE_URL` to that local fixture; never use linked project credentials:

```sh
psql "$LOCAL_DATABASE_URL" \
  -X -v ON_ERROR_STOP=1 \
  -f Backend/supabase/tests/database/11_sync_recruits_rotation.test.sql
```

Do not inject an earlier `ORDER BY`, rotate-function rewrite, or guard-table
workaround into the fixture. The test must observe the definitions from tracked
SQL. The checkpoint corrected an older baseline heartbeat projection that
blocked the August historical view replacement. Clean replay now applies all
77 tracked migrations without historical compatibility edits. The canonical
no-Docker verifier passed baseline application, idempotency and full replay.
The clean local replay passed 27 recruit assertions, 17 cache-batch assertions
and 10 scoring assertions. Local cron, net and Vault platform shapes are
shimmed; Supabase Auth, PostgREST and real scheduler behavior are not emulated.
Fold-state remains UNFOLDED, so baseline/full catalog equivalence is pending.
Earlier compatibility-prepared fixture results remain separate evidence.

For a two-backend deadlock regression, use only a disposable local database.
Do not use linked-project credentials or a remote connection string. The
following setup uses valid fixture tags and deliberately pauses after the
ascending first player row is locked:

```sql
INSERT INTO drivers.players (player_tag, player_name)
VALUES ('#2R9C2R9U', 'lock-order U'), ('#2R9C2R9Y', 'lock-order Y')
ON CONFLICT (player_tag) DO NOTHING;

CREATE FUNCTION public.cm_test_pause_recruit_lock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $test$
BEGIN
  IF OLD.player_tag = '#2R9C2R9U' THEN
    PERFORM pg_catalog.pg_sleep(2);
  END IF;
  RETURN NEW;
END;
$test$;

CREATE TRIGGER cm_test_pause_recruit_lock
BEFORE UPDATE ON drivers.players
FOR EACH ROW
EXECUTE FUNCTION public.cm_test_pause_recruit_lock();
```

Start these as separate shell processes against the explicit local database
URL. Start both immediately; the short delay aligns their overlap. Each payload
must update both player rows and upsert valid recruit records:

```sh
set +e
psql "$LOCAL_DATABASE_URL" \
  -X -v ON_ERROR_STOP=1 > /tmp/recruit-sync-ascending.log 2>&1 <<'SQL' &
SET ROLE service_role;
SET statement_timeout = '60s';
SELECT pg_sleep(0.25);
SELECT public.sync_recruits('[
  {"player_tag":"#2R9C2R9U","player_name":"lock-order U","trophies":10000,"donations":0,"war_wins":0,"win_rate":0,"cards":0,"raw_potential_score":1000001,"source":"MANUAL","status":"ACTIVE"},
  {"player_tag":"#2R9C2R9Y","player_name":"lock-order Y","trophies":10000,"donations":0,"war_wins":0,"win_rate":0,"cards":0,"raw_potential_score":1000000,"source":"MANUAL","status":"ACTIVE"}
]'::jsonb);
SQL
ascending_pid=$!

psql "$LOCAL_DATABASE_URL" \
  -X -v ON_ERROR_STOP=1 > /tmp/recruit-sync-descending.log 2>&1 <<'SQL' &
SET ROLE service_role;
SET statement_timeout = '60s';
SELECT pg_sleep(0.25);
SELECT public.sync_recruits('[
  {"player_tag":"#2R9C2R9Y","player_name":"lock-order Y","trophies":10000,"donations":0,"war_wins":0,"win_rate":0,"cards":0,"raw_potential_score":1000000,"source":"MANUAL","status":"ACTIVE"},
  {"player_tag":"#2R9C2R9U","player_name":"lock-order U","trophies":10000,"donations":0,"war_wins":0,"win_rate":0,"cards":0,"raw_potential_score":1000001,"source":"MANUAL","status":"ACTIVE"}
]'::jsonb);
SQL
descending_pid=$!

wait "$ascending_pid"; ascending_status=$?
wait "$descending_pid"; descending_status=$?
set -e
test "$ascending_status" -eq 0
test "$descending_status" -eq 0
! rg -n '40P01|deadlock detected' /tmp/recruit-sync-ascending.log /tmp/recruit-sync-descending.log
```

The trigger sleeps only on the lower tag. Before the repair, the
ascending session locks that tag and sleeps while the descending session locks
the higher tag and waits for the lower one. When the first session resumes and
requests the higher tag, PostgreSQL detects a deadlock. With the repair, both
sessions request the lower tag first: one waits before acquiring any higher
tag, and both complete. The evidence is that both `psql` exit statuses are
zero, neither output contains SQLSTATE `40P01`, and both test rows remain
consistent. On completion, clean up on that disposable database:

```sql
DROP TRIGGER cm_test_pause_recruit_lock ON drivers.players;
DROP FUNCTION public.cm_test_pause_recruit_lock();
DELETE FROM drivers.recruits WHERE player_tag IN ('#2R9C2R9U', '#2R9C2R9Y');
DELETE FROM drivers.players WHERE player_tag IN ('#2R9C2R9U', '#2R9C2R9Y');
```

The two-session procedure is not part of the transactional pgTAP file because
it needs independent committed sessions and a temporary test-only trigger. The
coordinator's `concurrency-before-after.json` records an isolated PG17 run using
the real `sync_recruits`, no-score payloads to isolate player upserts, and a
200 ms `BEFORE INSERT` delay to force overlap. All 3 opposite-order pairs
deadlocked before the repair; after it, all 3 pairs completed (six successful
calls). This verifies only overlapping `sync_recruits` batches; it does not
establish ordering for other writers such as `sync_players`. The script above
is an additional reproduction recipe and has not been independently rerun in
this assignment.

## Rollback

Migration application is transactional and changes no row data. If it fails,
PostgreSQL rolls back both function replacements. If a post-apply semantic
regression requires rollback, create a new forward migration with the Supabase
CLI and restore `public.sync_recruits(jsonb)` from the preceding tracked
definition in `20261009185835_suppress_duplicate_recruit_rotation.sql`.
Restore `substrate.rotate_recruits()` from the captured live invoker definition
in `live-definition-baseline.json` at the coordinator checkpoint. Do not copy
the body from `20260531232406_master_migration.sql`: that historical definition
is `SECURITY DEFINER` and does not match the deployed routine. Use
`CREATE OR REPLACE` to preserve postgres ownership and existing ACLs; do not
add grants or change schema exposure.

The captured live rotation body to place in that forward migration is:

```sql
CREATE OR REPLACE FUNCTION substrate.rotate_recruits()
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
DECLARE
    limit_val  INT;
    v_benched  INT;
    v_promoted INT;
BEGIN
    INSERT INTO substrate.pipeline_heartbeat (component_id, status, last_triggered_at, last_message)
    VALUES ('RECRUIT_ROTATION', 'RUNNING', NOW(), 'Rotation cycle initiated.')
    ON CONFLICT (component_id) DO UPDATE
    SET status = 'RUNNING', last_triggered_at = EXCLUDED.last_triggered_at, last_message = EXCLUDED.last_message;

    SELECT value::INT INTO limit_val FROM substrate.config WHERE key = 'MAX_ACTIVE_RECRUITS';

    DROP TABLE IF EXISTS elite_tags;
    CREATE TEMP TABLE elite_tags AS
    SELECT player_tag FROM drivers.recruits
    WHERE status != 'ARCHIVED'
    ORDER BY raw_potential_score DESC NULLS LAST
    LIMIT limit_val;

    WITH benched_rows AS (
        UPDATE drivers.recruits
        SET status = 'BENCHED'::drivers.recruit_status
        WHERE status = 'ACTIVE'::drivers.recruit_status
          AND player_tag NOT IN (SELECT player_tag FROM elite_tags)
        RETURNING player_tag
    )
    SELECT count(*) INTO v_benched FROM benched_rows;

    WITH promoted_rows AS (
        UPDATE drivers.recruits
        SET status = 'ACTIVE'::drivers.recruit_status
        WHERE player_tag IN (SELECT player_tag FROM elite_tags)
          AND status != 'ACTIVE'::drivers.recruit_status
        RETURNING player_tag
    )
    SELECT count(*) INTO v_promoted FROM promoted_rows;

    UPDATE substrate.pipeline_heartbeat
    SET status           = 'COMPLETED',
        last_success_at  = NOW(),
        last_message     = 'Rotation successful: ' || v_promoted || ' promoted, ' || v_benched || ' benched.',
        updated_at       = NOW()
    WHERE component_id = 'RECRUIT_ROTATION';

EXCEPTION WHEN OTHERS THEN
    UPDATE substrate.pipeline_heartbeat
    SET status          = 'FAILED',
        last_failure_at = NOW(),
        last_message    = SQLERRM,
        updated_at      = NOW()
    WHERE component_id = 'RECRUIT_ROTATION';
    RAISE;
END;
$function$;
```

Restoring those bodies also restores the opposite-order deadlock and temp-table
churn. Before running a forward rollback on a shared environment, pause
headhunter scanning and other recruit writers, then keep them paused until a
corrected migration is applied and verified. The rollback is for restoring
prior behavior during an incident, not a security or availability-neutral
steady state.

## Current verification limits

The coordinator provides a disposable PostgreSQL 17 database at
`127.0.0.1:55438/recruit_verified` with pgTAP and compatibility-prepared fixtures.
Report focused pgTAP results there without describing the setup as a clean
full-history replay. The coordinator owns migration inventory registration
and publication.
