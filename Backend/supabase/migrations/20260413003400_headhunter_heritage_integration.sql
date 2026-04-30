-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- 20260413003400: Integrate Heritage Blessing into Headhunter View

-- DEFENSIVE SCHEMATICS: Ensure heritage columns exist if IF NOT EXISTS skipped them in Pillar VIII
ALTER TABLE drivers.heritage_ledger ADD COLUMN IF NOT EXISTS max_pes INTEGER DEFAULT 0;

-- CLINICAL RESET: Mandatory drop to allow column name/order changes
DROP VIEW IF EXISTS features.headhunter_view CASCADE;

CREATE VIEW features.headhunter_view AS
WITH elite_benchmark AS (
    SELECT COALESCE(AVG(score), 12000) as value 
    FROM (
        SELECT raw_performance_score as score
        FROM features.scoring_view
        ORDER BY raw_performance_score DESC
        LIMIT 10
    ) sub
),
heritage_context AS (
    SELECT 
        tag,
        max_pes,
        tenure_days,
        (last_seen_at >= NOW() - INTERVAL '30 days') as is_fresh
    FROM drivers.heritage_ledger
)
SELECT 
    r.tag,
    r.name,
    r.trophies,
    r.donations,
    r.war_wins,
    r.raw_potential_score as rpos,
    -- BASE POS CALCULATION
    ROUND(
        ((r.raw_potential_score * (CASE WHEN COALESCE(h.is_fresh AND h.max_pes > 10000, FALSE) THEN 1.05 ELSE 1.0 END)) 
        / (SELECT value FROM elite_benchmark))::NUMERIC * 100, 
        1
    ) as pos,
    -- HERITAGE BLESSING: Applies a 5% bonus if they were a fresh high-performer (Max PeS > 10k)
    COALESCE(h.is_fresh AND h.max_pes > 10000, FALSE) as has_heritage_blessing,
    CASE 
        WHEN r.raw_potential_score >= 12000 THEN 'ELITE'
        WHEN r.raw_potential_score >= 10500 THEN 'HIGH'
        ELSE 'MID'
    END as tier,
    r.last_scan as last_seen_at,
    -- RELATIONAL CONTEXT
    CASE 
        WHEN h.tag IS NOT NULL AND h.is_fresh THEN 'RETURNING_VETERAN'
        WHEN h.tag IS NOT NULL THEN 'FORMER_MEMBER'
        ELSE 'NEW_CANDIDATE'
    END as heritage_status
FROM drivers.recruits r
LEFT JOIN heritage_context h ON h.tag = r.tag
WHERE r.status = 'ACTIVE'
  -- THE SHIELD: Blacklist gate
  AND NOT EXISTS (
      SELECT 1 FROM drivers.recruit_blacklist bl WHERE bl.tag = r.tag
  )
ORDER BY r.raw_potential_score DESC;
