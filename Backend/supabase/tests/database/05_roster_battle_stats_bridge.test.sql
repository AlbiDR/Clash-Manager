-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(5);

SELECT ok(
  has_function_privilege('anon', 'features.get_active_roster_win_rates()', 'EXECUTE'),
  'anon can execute the roster-safe win-rate bridge'
);
SELECT ok(
  has_function_privilege('authenticated', 'features.get_active_roster_win_rates()', 'EXECUTE'),
  'authenticated can execute the roster-safe win-rate bridge'
);
SELECT ok(
  has_function_privilege('service_role', 'features.get_active_roster_win_rates()', 'EXECUTE'),
  'service_role can execute the roster-safe win-rate bridge'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_proc AS routine
    CROSS JOIN LATERAL aclexplode(
      COALESCE(routine.proacl, acldefault('f', routine.proowner))
    ) AS privilege
    WHERE routine.oid = 'features.get_active_roster_win_rates()'::regprocedure
      AND privilege.grantee = 0
      AND privilege.privilege_type = 'EXECUTE'
  ),
  'PUBLIC cannot execute the roster-safe win-rate bridge'
);
SELECT lives_ok(
  $$ SET LOCAL ROLE anon; SELECT * FROM features.roster_view LIMIT 1; $$,
  'anon can read roster_view through the private battle-stat helper'
);

SELECT * FROM finish();
ROLLBACK;
