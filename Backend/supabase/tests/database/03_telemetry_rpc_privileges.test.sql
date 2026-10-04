-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(12);

SELECT ok(
  NOT has_function_privilege('anon', 'public.report_heartbeat(text,text,text,jsonb)', 'EXECUTE'),
  'anon cannot execute report_heartbeat'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.report_heartbeat(text,text,text,jsonb)', 'EXECUTE'),
  'authenticated cannot execute report_heartbeat'
);
SELECT ok(
  has_function_privilege('service_role', 'public.report_heartbeat(text,text,text,jsonb)', 'EXECUTE'),
  'service_role can execute report_heartbeat'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_proc AS routine
    CROSS JOIN LATERAL aclexplode(COALESCE(routine.proacl, acldefault('f', routine.proowner))) AS privilege
    WHERE routine.oid = 'public.report_heartbeat(text,text,text,jsonb)'::regprocedure
      AND privilege.grantee = 0
      AND privilege.privilege_type = 'EXECUTE'
  ),
  'PUBLIC cannot execute report_heartbeat'
);

SELECT ok(
  NOT has_function_privilege('anon', 'public.report_telemetry(text,text,jsonb)', 'EXECUTE'),
  'anon cannot execute report_telemetry'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.report_telemetry(text,text,jsonb)', 'EXECUTE'),
  'authenticated cannot execute report_telemetry'
);
SELECT ok(
  has_function_privilege('service_role', 'public.report_telemetry(text,text,jsonb)', 'EXECUTE'),
  'service_role can execute report_telemetry'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_proc AS routine
    CROSS JOIN LATERAL aclexplode(COALESCE(routine.proacl, acldefault('f', routine.proowner))) AS privilege
    WHERE routine.oid = 'public.report_telemetry(text,text,jsonb)'::regprocedure
      AND privilege.grantee = 0
      AND privilege.privilege_type = 'EXECUTE'
  ),
  'PUBLIC cannot execute report_telemetry'
);

SELECT ok(
  NOT has_function_privilege('anon', 'public.update_telemetry(uuid,text,jsonb)', 'EXECUTE'),
  'anon cannot execute update_telemetry'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.update_telemetry(uuid,text,jsonb)', 'EXECUTE'),
  'authenticated cannot execute update_telemetry'
);
SELECT ok(
  has_function_privilege('service_role', 'public.update_telemetry(uuid,text,jsonb)', 'EXECUTE'),
  'service_role can execute update_telemetry'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_proc AS routine
    CROSS JOIN LATERAL aclexplode(COALESCE(routine.proacl, acldefault('f', routine.proowner))) AS privilege
    WHERE routine.oid = 'public.update_telemetry(uuid,text,jsonb)'::regprocedure
      AND privilege.grantee = 0
      AND privilege.privilege_type = 'EXECUTE'
  ),
  'PUBLIC cannot execute update_telemetry'
);

SELECT * FROM finish();
ROLLBACK;
