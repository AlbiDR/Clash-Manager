-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- 1. Purge Raw Logs (24h retention)
CREATE OR REPLACE FUNCTION substrate.purge_raw_logs()
RETURNS void AS $$
BEGIN
    DELETE FROM substrate.raw_clan_profile WHERE ingested_at < (now() - interval '24 hours');
    DELETE FROM substrate.raw_clan_members WHERE ingested_at < (now() - interval '24 hours');
    DELETE FROM substrate.raw_river_race WHERE ingested_at < (now() - interval '24 hours');
    DELETE FROM substrate.raw_war_log WHERE ingested_at < (now() - interval '24 hours');
    DELETE FROM substrate.raw_scout_logs WHERE ingested_at < (now() - interval '24 hours');
END;
$$ LANGUAGE plpgsql;

-- 2. Purge Governance Telemetry (30d retention)
CREATE OR REPLACE FUNCTION substrate.purge_governance_telemetry()
RETURNS void AS $$
BEGIN
    DELETE FROM substrate.governance_telemetry WHERE created_at < (now() - interval '30 days');
END;
$$ LANGUAGE plpgsql;

-- 3. Execute Nightly Maintenance
CREATE OR REPLACE FUNCTION substrate.execute_nightly_maintenance()
RETURNS void AS $$
BEGIN
    PERFORM substrate.purge_raw_logs();
    PERFORM substrate.purge_governance_telemetry();
    
    -- Update heartbeat
    INSERT INTO substrate.pipeline_heartbeat (component_id, status, last_triggered_at, last_success_at, last_message)
    VALUES ('NIGHTLY_MAINTENANCE', 'COMPLETED', now(), now(), 'Clinical purge of raw logs and telemetry completed.')
    ON CONFLICT (component_id) DO UPDATE SET
        status = EXCLUDED.status,
        last_triggered_at = EXCLUDED.last_triggered_at,
        last_success_at = EXCLUDED.last_success_at,
        last_message = EXCLUDED.last_message,
        updated_at = now();
END;
$$ LANGUAGE plpgsql;

-- 4. Registry Heartbeat Initialization
INSERT INTO substrate.pipeline_heartbeat (component_id, status, last_message)
VALUES 
    ('INGESTION_PIPELINE', 'IDLE', 'Initialized.'),
    ('HEADHUNTER_SCANNER', 'IDLE', 'Initialized.')
ON CONFLICT (component_id) DO NOTHING;

-- 5. pg_cron Setup (Every night at 03:00 UTC)
-- We use DO block to prevent error if cron isn't accessible or job already exists
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.schedule('nightly-maintenance', '0 3 * * *', 'SELECT substrate.execute_nightly_maintenance()');
    END IF;
END $$;
