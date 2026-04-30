-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- 1. Function to verify microscopic integrity from audit logs
CREATE OR REPLACE FUNCTION substrate.verify_run_integrity(p_telemetry_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_audit_log JSONB;
    v_is_perfect BOOLEAN := TRUE;
    v_entry JSONB;
BEGIN
    -- Extract the audit log from metadata
    SELECT metadata->'audit_log' INTO v_audit_log
    FROM substrate.governance_telemetry
    WHERE id = p_telemetry_id;

    IF v_audit_log IS NULL OR jsonb_array_length(v_audit_log) = 0 THEN
        RETURN FALSE;
    END IF;

    -- Iterate through audit log entries
    FOR v_entry IN SELECT * FROM jsonb_array_elements(v_audit_log)
    LOOP
        -- Check for 'resulted_data' actions
        IF v_entry->>'action' = 'resulted_data' THEN
            -- If any validation failed, the run is not perfect
            IF (v_entry->'details'->>'is_100_percent_match')::BOOLEAN IS FALSE THEN
                v_is_perfect := FALSE;
                EXIT;
            END IF;
        END IF;
        
        -- Check for explicit error actions
        IF v_entry->>'action' = 'error' THEN
            v_is_perfect := FALSE;
            EXIT;
        END IF;
    END LOOP;

    RETURN v_is_perfect;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Trigger function to synchronize integrity with heartbeat registry
CREATE OR REPLACE FUNCTION substrate.on_telemetry_complete()
RETURNS TRIGGER AS $$
DECLARE
    v_component_id TEXT;
    v_is_perfect BOOLEAN;
BEGIN
    -- Map event_type to component_id
    v_component_id := CASE NEW.event_type
        WHEN 'INGESTION_CYCLE' THEN 'ROYALE_DATA_INGESTOR'
        WHEN 'HEADHUNTER_SCAN' THEN 'HEADHUNTER_SCANNER'
        ELSE NULL
    END;

    IF v_component_id IS NOT NULL AND (NEW.status = 'SUCCESS' OR NEW.status = 'COMPLETE') THEN
        -- Calculate microscopic integrity
        v_is_perfect := substrate.verify_run_integrity(NEW.id);
        
        -- Update the heartbeat registry
        UPDATE substrate.pipeline_heartbeat
        SET 
            is_data_perfect = v_is_perfect,
            last_validation_report = jsonb_build_object(
                'telemetry_id', NEW.id,
                'verified_at', now(),
                'checks_passed', v_is_perfect
            )
        WHERE component_id = v_component_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Attach the trigger
DROP TRIGGER IF EXISTS tr_telemetry_integrity_sync ON substrate.governance_telemetry;
CREATE TRIGGER tr_telemetry_integrity_sync
    AFTER UPDATE OF status ON substrate.governance_telemetry
    FOR EACH ROW
    WHEN (NEW.status IN ('SUCCESS', 'COMPLETE'))
    EXECUTE FUNCTION substrate.on_telemetry_complete();

-- 4. Governance Documentation
COMMENT ON FUNCTION substrate.verify_run_integrity IS 'Automates the validation of pipeline runs by scanning the microscopic audit_log for data mismatches or errors.';
COMMENT ON FUNCTION substrate.on_telemetry_complete IS 'Synchronizes governance telemetry results with the pipeline_heartbeat registry to provide a high-level health overview.';
