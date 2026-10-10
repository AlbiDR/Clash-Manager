-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(19);

SELECT has_function(
    'public', 'report_anchor_yield', ARRAY['text', 'integer', 'boolean'],
    'the default API schema has the scanner yield signature'
);
SELECT ok(
    has_schema_privilege('service_role', 'substrate', 'USAGE'),
    'the service role can resolve the private implementation'
);
SELECT ok(
    (SELECT NOT prosecdef AND proconfig = ARRAY['search_path=""']
     FROM pg_proc
     WHERE oid = 'public.report_anchor_yield(text,integer,boolean)'::regprocedure),
    'the bridge runs as its caller with a fixed empty search path'
);
SELECT ok(
    NOT has_function_privilege('anon', 'public.report_anchor_yield(text,integer,boolean)', 'EXECUTE'),
    'anon cannot execute the yield bridge'
);
SELECT ok(
    NOT has_function_privilege('authenticated', 'public.report_anchor_yield(text,integer,boolean)', 'EXECUTE'),
    'authenticated cannot execute the yield bridge'
);
SELECT ok(
    has_function_privilege('service_role', 'public.report_anchor_yield(text,integer,boolean)', 'EXECUTE'),
    'service_role can execute the yield bridge'
);
SELECT ok(
    NOT EXISTS (
        SELECT 1
        FROM pg_proc AS routine
        CROSS JOIN LATERAL aclexplode(
            COALESCE(routine.proacl, acldefault('f', routine.proowner))
        ) AS privilege
        WHERE routine.oid = 'public.report_anchor_yield(text,integer,boolean)'::regprocedure
          AND privilege.grantee = 0
          AND privilege.privilege_type = 'EXECUTE'
    ),
    'PUBLIC has no execution grant on the yield bridge'
);
SELECT ok(
    NOT has_function_privilege('anon', 'substrate.report_anchor_yield(text,integer,boolean)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'substrate.report_anchor_yield(text,integer,boolean)', 'EXECUTE'),
    'browser roles remain denied execution of the private implementation'
);
SELECT ok(
    has_function_privilege('service_role', 'substrate.report_anchor_yield(text,integer,boolean)', 'EXECUTE'),
    'the service role can execute the delegated implementation'
);

-- Distinct fixtures ensure a test never overwrites a real discovery anchor.
INSERT INTO substrate.discovery_anchors
    (keyword, last_scanned_at, total_yield, total_scans, rate_limited_scans, last_yield)
VALUES
    ('__cm_anchor_yield_api_test__', '2000-01-01T00:00:00Z', 0, 0, 0, 0),
    ('__cm_anchor_yield_api_control__', '2000-01-01T00:00:00Z', 11, 4, 2, 3);

SELECT lives_ok(
    $$ SET LOCAL ROLE service_role;
       SELECT public.report_anchor_yield(p_keyword => '__cm_anchor_yield_api_test__', p_yield => 7);
       RESET ROLE; $$,
    'the scanner two-argument call executes under service_role'
);
SELECT ok(
    (SELECT total_yield = 7 AND total_scans = 1 AND rate_limited_scans = 0 AND last_yield = 7
     FROM substrate.discovery_anchors WHERE keyword = '__cm_anchor_yield_api_test__'),
    'the omitted rate-limit flag defaults to false and yield accounting advances'
);
SELECT is(
    (SELECT last_scanned_at FROM substrate.discovery_anchors WHERE keyword = '__cm_anchor_yield_api_test__'),
    now(),
    'a report records the scan time through the real private implementation'
);
SELECT lives_ok(
    $$ SET LOCAL ROLE service_role;
       SELECT public.report_anchor_yield('__cm_anchor_yield_api_test__', 5, true);
       RESET ROLE; $$,
    'an explicit rate-limited report executes under service_role'
);
SELECT ok(
    (SELECT total_yield = 12 AND total_scans = 2 AND rate_limited_scans = 1 AND last_yield = 5
     FROM substrate.discovery_anchors WHERE keyword = '__cm_anchor_yield_api_test__'),
    'an explicit true flag reaches private rate-limit accounting'
);
SET LOCAL ROLE service_role;
SELECT public.report_anchor_yield('__cm_anchor_yield_api_test__', 0, false);
RESET ROLE;
SELECT ok(
    (SELECT total_yield = 12 AND total_scans = 3 AND rate_limited_scans = 1 AND last_yield = 0
     FROM substrate.discovery_anchors WHERE keyword = '__cm_anchor_yield_api_test__'),
    'an explicit false flag counts a zero-yield scan without adding a rate-limit scan'
);
SELECT ok(
    (SELECT total_yield = 11 AND total_scans = 4 AND rate_limited_scans = 2 AND last_yield = 3
            AND last_scanned_at = '2000-01-01T00:00:00Z'::timestamptz
     FROM substrate.discovery_anchors WHERE keyword = '__cm_anchor_yield_api_control__'),
    'yield reports leave unrelated anchors unchanged'
);
SET LOCAL ROLE service_role;
SELECT public.report_anchor_yield('__cm_anchor_yield_api_missing__', 7);
RESET ROLE;
SELECT ok(
    NOT EXISTS (SELECT 1 FROM substrate.discovery_anchors WHERE keyword = '__cm_anchor_yield_api_missing__')
    AND (SELECT total_yield = 12 AND total_scans = 3 AND rate_limited_scans = 1 AND last_yield = 0
         FROM substrate.discovery_anchors WHERE keyword = '__cm_anchor_yield_api_test__'),
    'an unknown keyword creates no anchor and does not change another anchor'
);
SELECT throws_ok(
    $$ SET LOCAL ROLE anon;
       SELECT public.report_anchor_yield('__cm_anchor_yield_api_test__', 99);
       RESET ROLE; $$,
    '42501', NULL,
    'anon calls are rejected before they can change anchor accounting'
);
SELECT throws_ok(
    $$ SET LOCAL ROLE authenticated;
       SELECT public.report_anchor_yield('__cm_anchor_yield_api_test__', 99);
       RESET ROLE; $$,
    '42501', NULL,
    'authenticated calls are rejected before they can change anchor accounting'
);

SELECT * FROM finish();
ROLLBACK;
