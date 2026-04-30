-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- 20260414000000: Adaptive Discovery Logic & Shadow Seeding Pool

-- 1. Discovery Cache (Deduplication Layer)
CREATE TABLE IF NOT EXISTS substrate.discovery_cache (
    tag TEXT PRIMARY KEY,
    type TEXT NOT NULL, -- 'TOURNAMENT' or 'PLAYER'
    scanned_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for expiration cleanup
CREATE INDEX IF NOT EXISTS idx_discovery_cache_scanned_at ON substrate.discovery_cache(scanned_at);

-- 2. Discovery Telemetry (Yield Tracking)
ALTER TABLE substrate.governance_telemetry 
ADD COLUMN IF NOT EXISTS discovery_yield INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS discovery_duplicates INT DEFAULT 0;

-- 3. Top Recruits View (Recursive Seeding Pool)
-- Identifies the Top 25% of active candidates for deep battle-log scouting.
CREATE OR REPLACE VIEW drivers.top_recruits_view AS
WITH stats AS (
    SELECT percentile_cont(0.75) WITHIN GROUP (ORDER BY pos) as threshold
    FROM features.headhunter_view
)
SELECT hv.*
FROM features.headhunter_view hv, stats
WHERE hv.pos >= stats.threshold
  AND hv.heritage_status != 'RETURNING_VETERAN' -- Focus on fresh leads
ORDER BY hv.pos DESC;

-- 4. TTL Cleanup Policy (24h Window)
CREATE OR REPLACE FUNCTION substrate.purge_stale_discovery_cache()
RETURNS void AS $$
BEGIN
    DELETE FROM substrate.discovery_cache
    WHERE scanned_at < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;

-- Comment for Clinical Parity
COMMENT ON TABLE substrate.discovery_cache IS 'Prevents redundant API calls for overlapping alphanumeric discovery results.';
COMMENT ON VIEW drivers.top_recruits_view IS 'Dynamic 25th percentile pool for recursive shadow scouting.';
