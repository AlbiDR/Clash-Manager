-- Update report_heartbeat RPC to support metadata and validation reporting
-- This aligns the SQL bridge with the clinical protocol requirements.

CREATE OR REPLACE FUNCTION substrate.report_heartbeat(
    p_component_id TEXT,
    p_status substrate.pipeline_status,
    p_message TEXT DEFAULT NULL,
    p_yield INTEGER DEFAULT 0,
    p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS VOID AS $$
BEGIN
    INSERT INTO substrate.pipeline_heartbeat (
        component_id, 
        status, 
        last_triggered_at, 
        last_message, 
        discovery_yield,
        last_validation_report,
        is_data_perfect
    )
    VALUES (
        p_component_id, 
        p_status, 
        NOW(), 
        p_message, 
        p_yield,
        COALESCE(p_metadata->'last_validation_report', '{}'::jsonb),
        COALESCE((p_metadata->>'is_data_perfect')::BOOLEAN, FALSE)
    )
    ON CONFLICT (component_id) DO UPDATE SET
        status = EXCLUDED.status,
        last_triggered_at = CASE 
            WHEN EXCLUDED.status = 'RUNNING' THEN EXCLUDED.last_triggered_at 
            ELSE pipeline_heartbeat.last_triggered_at 
        END,
        last_success_at = CASE 
            WHEN EXCLUDED.status = 'COMPLETED' THEN NOW() 
            ELSE pipeline_heartbeat.last_success_at 
        END,
        last_failure_at = CASE 
            WHEN EXCLUDED.status = 'FAILED' THEN NOW() 
            ELSE pipeline_heartbeat.last_failure_at 
        END,
        last_message = EXCLUDED.last_message,
        discovery_yield = EXCLUDED.discovery_yield,
        last_validation_report = EXCLUDED.last_validation_report,
        is_data_perfect = EXCLUDED.is_data_perfect,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
