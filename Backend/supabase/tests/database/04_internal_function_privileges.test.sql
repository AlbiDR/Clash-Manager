-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(12);

CREATE TEMP TABLE internal_function_acl_target (
  function_signature text PRIMARY KEY,
  description text NOT NULL
);

INSERT INTO internal_function_acl_target (function_signature, description)
VALUES
  ('drivers.get_player_battle_stats(integer,text[])', 'battle-stat view helper'),
  ('drivers.on_voyage_active_change()', 'voyage trigger function'),
  ('drivers.sync_voyage_finalization_job()', 'voyage cron gate');

SELECT ok(
  NOT has_function_privilege('anon', function_signature, 'EXECUTE'),
  'anon cannot execute ' || description
)
FROM internal_function_acl_target;

SELECT ok(
  NOT has_function_privilege('authenticated', function_signature, 'EXECUTE'),
  'authenticated cannot execute ' || description
)
FROM internal_function_acl_target;

SELECT ok(
  has_function_privilege('service_role', function_signature, 'EXECUTE'),
  'service_role can execute ' || description
)
FROM internal_function_acl_target;

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_proc AS routine
    CROSS JOIN LATERAL aclexplode(
      COALESCE(routine.proacl, acldefault('f', routine.proowner))
    ) AS privilege
    WHERE routine.oid = function_signature::regprocedure
      AND privilege.grantee = 0
      AND privilege.privilege_type = 'EXECUTE'
  ),
  'PUBLIC cannot execute ' || description
)
FROM internal_function_acl_target;

SELECT * FROM finish();
ROLLBACK;
