-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR
-- Exposes the RESOURCE_PRESSURE warnings that substrate.check_resource_pressure()
-- logs into governance_telemetry, so the Settings PWA can actually surface
-- them (previously they were only visible via a direct SQL query). Same
-- minimal-projection pattern as features.pipeline_heartbeat_view: a narrow,
-- read-only view granted to anon/authenticated, not the underlying
-- substrate table. Rationale in the commit message.

BEGIN;

CREATE VIEW features.resource_health_view AS
SELECT message, created_at
FROM substrate.governance_telemetry
WHERE event_type = 'RESOURCE_PRESSURE'
  AND created_at > now() - interval '48 hours'
ORDER BY created_at DESC
LIMIT 10;

GRANT SELECT ON features.resource_health_view TO anon, authenticated, service_role;

COMMIT;
