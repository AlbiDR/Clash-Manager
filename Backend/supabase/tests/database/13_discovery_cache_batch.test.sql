-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(17);

SELECT has_function(
    'public', 'upsert_discovery_cache_batch', ARRAY['text[]', 'text'],
    'the public API exposes the bounded batch signature'
);
SELECT ok(
    (SELECT prosecdef AND proconfig = ARRAY['search_path=""']
     FROM pg_proc
     WHERE oid = 'public.upsert_discovery_cache_batch(text[],text)'::regprocedure),
    'the batch function is SECURITY DEFINER with an empty fixed search path'
);
SELECT ok(
    NOT has_function_privilege('anon', 'public.upsert_discovery_cache_batch(text[],text)', 'EXECUTE'),
    'anon cannot execute the batch function'
);
SELECT ok(
    NOT has_function_privilege('authenticated', 'public.upsert_discovery_cache_batch(text[],text)', 'EXECUTE'),
    'authenticated cannot execute the batch function'
);
SELECT ok(
    has_function_privilege('service_role', 'public.upsert_discovery_cache_batch(text[],text)', 'EXECUTE'),
    'service_role can execute the batch function'
);
SELECT ok(
    NOT EXISTS (
        SELECT 1
        FROM pg_proc AS routine
        CROSS JOIN LATERAL aclexplode(COALESCE(routine.proacl, acldefault('f', routine.proowner))) AS privilege
        WHERE routine.oid = 'public.upsert_discovery_cache_batch(text[],text)'::regprocedure
          AND privilege.grantee = 0
          AND privilege.privilege_type = 'EXECUTE'
    ),
    'PUBLIC has no execution grant on the batch function'
);
SELECT has_function(
    'public', 'upsert_discovery_cache', ARRAY['text', 'text'],
    'the existing single-row RPC remains available for compatibility'
);

SET LOCAL ROLE service_role;
SELECT lives_ok(
    $$ SELECT public.upsert_discovery_cache_batch(ARRAY[]::text[], 'TOURNAMENT') $$,
    'an empty batch is a successful no-op'
);
RESET ROLE;
SELECT ok(
    NOT EXISTS (SELECT 1 FROM substrate.discovery_cache WHERE player_tag = '#CY'),
    'the empty batch inserts no cache row'
);

SET LOCAL ROLE service_role;
SELECT lives_ok(
    $$ SELECT public.upsert_discovery_cache_batch(ARRAY['#CC', '#CC']::text[], 'TOURNAMENT') $$,
    'duplicate tags in one batch do not cause a conflict-target error'
);
RESET ROLE;
SELECT is(
    (SELECT count(*)::integer FROM substrate.discovery_cache WHERE player_tag = '#CC'),
    1,
    'a repeated tag results in exactly one cache row'
);
SELECT ok(
    (SELECT type = 'TOURNAMENT' AND scanned_at = now()
     FROM substrate.discovery_cache WHERE player_tag = '#CC'),
    'a new cache row uses the requested type and current scan time'
);

UPDATE substrate.discovery_cache SET scanned_at = '2000-01-01T00:00:00Z' WHERE player_tag = '#CC';
SET LOCAL ROLE service_role;
SELECT lives_ok(
    $$ SELECT public.upsert_discovery_cache_batch(ARRAY['#CC']::text[], 'UPDATED') $$,
    'a repeated tag updates the existing cache row'
);
RESET ROLE;
SELECT ok(
    (SELECT type = 'UPDATED' AND scanned_at = now()
     FROM substrate.discovery_cache WHERE player_tag = '#CC'),
    'conflict handling refreshes scanned_at and replaces type like the single-row RPC'
);

SET LOCAL ROLE service_role;
SELECT throws_ok(
    $$ SELECT public.upsert_discovery_cache_batch(ARRAY['#CR', '#--']::text[], 'TOURNAMENT') $$,
    '23514', NULL,
    'an invalid tag fails the entire batch'
);
SELECT throws_ok(
    $$ SELECT public.upsert_discovery_cache_batch(array_fill('#CV'::text, ARRAY[51]), 'TOURNAMENT') $$,
    '22023', 'p_tags exceeds the maximum batch size',
    'a batch larger than fifty entries is rejected'
);
RESET ROLE;
SELECT ok(
    NOT EXISTS (SELECT 1 FROM substrate.discovery_cache WHERE player_tag IN ('#CR', '#CV')),
    'failed batches leave no partial cache rows'
);

SELECT * FROM finish();
ROLLBACK;
