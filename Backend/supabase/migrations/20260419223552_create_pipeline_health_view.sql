-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- 1. Create a flattened view for pipeline health monitoring
CREATE OR REPLACE VIEW substrate.view_pipeline_health AS
SELECT 
    component_id,
    status,
    is_data_perfect,
    last_triggered_at,
    last_success_at,
    last_failure_at,
    last_message,
    discovery_yield,
    (last_validation_report->>'verified_at')::TIMESTAMPTZ as last_verified_at,
    last_validation_report->>'telemetry_id' as last_telemetry_id
FROM substrate.pipeline_heartbeat;

-- 2. Grant access to authenticated users (PWA)
GRANT SELECT ON substrate.view_pipeline_health TO authenticated;

-- 3. Governance Documentation
COMMENT ON VIEW substrate.view_pipeline_health IS 'Public-facing observability view for the PWA to monitor backend pipeline health and data integrity status.';
