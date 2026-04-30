-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

/**
 * Migration: Autonomous Discovery Anchors
 * Phase 6: Learning Discovery Mechanisms
 * 
 * This migration transitions the Tournament Discovery stage from hardcoded 
 * keywords to a database-driven "Anchor" pool that tracks yield and 
 * prioritizes high-performance search terms.
 */

BEGIN;

-- 1. Create Discovery Anchors Table
CREATE TABLE IF NOT EXISTS substrate.discovery_anchors (
    keyword TEXT PRIMARY KEY,
    total_yield INT DEFAULT 0,
    total_scans INT DEFAULT 0,
    last_yield INT DEFAULT 0,
    last_scanned_at TIMESTAMPTZ,
    priority INT DEFAULT 1, -- 1: Normal, 2: High (Manual Override)
    status TEXT DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'STALE', 'DISABLED'))
);

-- Index for performance-based rotation
CREATE INDEX IF NOT EXISTS idx_discovery_anchors_yield ON substrate.discovery_anchors (total_yield DESC);
CREATE INDEX IF NOT EXISTS idx_discovery_anchors_last_scan ON substrate.discovery_anchors (last_scanned_at ASC);

-- 2. Seed Initial Anchors (Current hardcoded set)
INSERT INTO substrate.discovery_anchors (keyword)
VALUES 
    ('a'), ('b'), ('c'), ('d'), ('e'), ('f'), ('g'), ('h'), ('i'), ('j'), 
    ('k'), ('l'), ('m'), ('n'), ('o'), ('p'), ('q'), ('r'), ('s'), ('t'), 
    ('u'), ('v'), ('w'), ('x'), ('y'), ('z'),
    ('0'), ('1'), ('2'), ('3'), ('4'), ('5'), ('6'), ('7'), ('8'), ('9')
ON CONFLICT (keyword) DO NOTHING;

-- 3. RPC: get_active_discovery_anchors
-- Returns a mix of high-yield and least-recently-scanned keywords. Includes self-healing to prevent total halt.
CREATE OR REPLACE FUNCTION substrate.get_active_discovery_anchors(p_limit INT DEFAULT 15)
RETURNS TABLE (keyword TEXT) AS $$
DECLARE
    v_active_count INT;
BEGIN
    -- Autonomous Self-Healing: Prevent discovery halt if all anchors go STALE
    SELECT count(*) INTO v_active_count FROM substrate.discovery_anchors WHERE status = 'ACTIVE';
    IF v_active_count < p_limit THEN
        UPDATE substrate.discovery_anchors 
        SET status = 'ACTIVE', total_scans = 0 
        WHERE status = 'STALE';
    END IF;

    RETURN QUERY
    (
        -- Priority 1: High Yield (Top 5)
        SELECT da.keyword
        FROM substrate.discovery_anchors da
        WHERE da.status = 'ACTIVE'
        ORDER BY da.total_yield DESC
        LIMIT (p_limit / 3)
    )
    UNION
    (
        -- Priority 2: Least Recently Scanned (Exploration)
        SELECT da.keyword
        FROM substrate.discovery_anchors da
        WHERE da.status = 'ACTIVE'
        ORDER BY da.last_scanned_at ASC NULLS FIRST
        LIMIT (p_limit - (p_limit / 3))
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. RPC: report_anchor_yield
-- Updates stats for a keyword after a scan.
CREATE OR REPLACE FUNCTION substrate.report_anchor_yield(p_keyword TEXT, p_yield INT)
RETURNS VOID AS $$
BEGIN
    UPDATE substrate.discovery_anchors
    SET 
        total_yield = total_yield + p_yield,
        total_scans = total_scans + 1,
        last_yield = p_yield,
        last_scanned_at = NOW()
    WHERE keyword = p_keyword;

    -- Autonomous Quality Control: 
    -- If an anchor consistently yields 0 for 20 scans, mark as STALE.
    UPDATE substrate.discovery_anchors
    SET status = 'STALE'
    WHERE keyword = p_keyword
      AND total_scans > 20
      AND total_yield = 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Governance Telemetry integration
COMMENT ON TABLE substrate.discovery_anchors IS 'Pool of search terms for tournament discovery, weighted by success rate.';
COMMENT ON FUNCTION substrate.get_active_discovery_anchors(INT) IS 'Balances discovery between proven high-yield terms and exploration of stale terms.';

COMMIT;
