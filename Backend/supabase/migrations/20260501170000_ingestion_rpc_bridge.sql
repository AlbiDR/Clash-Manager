-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR
-- 1. CREATE CLINICAL INGESTION BRIDGE
-- This RPC allows the Edge Function to ingest raw data into the substrate schema
-- without requiring the substrate schema to be exposed via PostgREST.

CREATE OR REPLACE FUNCTION public.ingest_raw_clan_profile(p_clan_tag TEXT, p_payload JSONB)
RETURNS VOID AS $$
BEGIN
    INSERT INTO substrate.raw_clan_profile (clan_tag, payload, ingested_at)
    VALUES (p_clan_tag, p_payload, NOW());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.ingest_raw_clan_members(p_clan_tag TEXT, p_payload JSONB)
RETURNS VOID AS $$
BEGIN
    INSERT INTO substrate.raw_clan_members (clan_tag, payload, ingested_at)
    VALUES (p_clan_tag, p_payload, NOW());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.ingest_raw_river_race(p_clan_tag TEXT, p_payload JSONB)
RETURNS VOID AS $$
BEGIN
    INSERT INTO substrate.raw_river_race (clan_tag, payload, ingested_at)
    VALUES (p_clan_tag, p_payload, NOW());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.report_telemetry(p_event_type TEXT, p_status TEXT, p_metadata JSONB)
RETURNS TABLE (id UUID) AS $$
BEGIN
    RETURN QUERY
    INSERT INTO substrate.governance_telemetry (event_type, status, metadata, created_at)
    VALUES (p_event_type, p_status, p_metadata, NOW())
    RETURNING governance_telemetry.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.update_telemetry(p_id UUID, p_status TEXT, p_metadata JSONB)
RETURNS VOID AS $$
BEGIN
    UPDATE substrate.governance_telemetry
    SET status = p_status,
        metadata = p_metadata,
        updated_at = NOW()
    WHERE id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.report_heartbeat(p_component_id TEXT, p_status TEXT, p_message TEXT, p_metadata JSONB DEFAULT '{}'::JSONB)
RETURNS VOID AS $$
BEGIN
    INSERT INTO substrate.pipeline_heartbeat (component_id, status, last_message, last_triggered_at, metadata)
    VALUES (p_component_id, p_status, p_message, NOW(), p_metadata)
    ON CONFLICT (component_id) DO UPDATE
    SET status = EXCLUDED.status,
        last_message = EXCLUDED.last_message,
        last_triggered_at = EXCLUDED.last_triggered_at,
        metadata = substrate.pipeline_heartbeat.metadata || EXCLUDED.metadata;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.sync_players(p_players JSONB)
RETURNS VOID AS $$
BEGIN
    INSERT INTO drivers.players (player_tag, player_name)
    SELECT (val->>'player_tag')::TEXT, (val->>'player_name')::TEXT
    FROM jsonb_array_elements(p_players) AS val
    ON CONFLICT (player_tag) DO UPDATE
    SET player_name = EXCLUDED.player_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.sync_recruits(p_recruits JSONB)
RETURNS VOID AS $$
BEGIN
    INSERT INTO drivers.recruits (player_tag, player_name, trophies, source, status)
    SELECT 
        (val->>'player_tag')::TEXT, 
        (val->>'player_name')::TEXT, 
        (val->>'trophies')::INTEGER, 
        (val->>'source')::TEXT, 
        (val->>'status')::TEXT
    FROM jsonb_array_elements(p_recruits) AS val
    ON CONFLICT (player_tag) DO UPDATE
    SET player_name = EXCLUDED.player_name,
        trophies = EXCLUDED.trophies,
        source = EXCLUDED.source,
        status = EXCLUDED.status;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_ingestion_targets()
RETURNS JSONB AS $$
DECLARE
    v_recruits JSONB;
    v_members JSONB;
BEGIN
    SELECT jsonb_agg(player_tag) INTO v_recruits FROM drivers.recruits WHERE status = 'ACTIVE' LIMIT 50;
    SELECT jsonb_agg(player_tag) INTO v_members FROM drivers.members WHERE is_active = true;
    
    RETURN jsonb_build_object(
        'recruits', COALESCE(v_recruits, '[]'::JSONB),
        'members', COALESCE(v_members, '[]'::JSONB)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant access to authenticated and service_role
GRANT EXECUTE ON FUNCTION public.ingest_raw_clan_profile(TEXT, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ingest_raw_clan_members(TEXT, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ingest_raw_river_race(TEXT, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ingest_raw_war_log(TEXT, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.report_discovery(TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.report_telemetry(TEXT, TEXT, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_telemetry(UUID, TEXT, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.report_heartbeat(TEXT, TEXT, TEXT, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_players(JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_recruits(JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_ingestion_targets() TO authenticated, service_role;
