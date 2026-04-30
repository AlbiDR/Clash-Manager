-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- Drop and Recreate to allow column name changes (RPoS, PoS)
DROP VIEW IF EXISTS features.headhunter_view;

CREATE OR REPLACE VIEW features.headhunter_view AS
WITH elite_benchmark AS (
    SELECT COALESCE(AVG(score), 12000) as value 
    FROM (
        SELECT raw_performance_score as score
        FROM features.scoring_view
        ORDER BY raw_performance_score DESC
        LIMIT 10
    ) sub
)
SELECT 
    r.tag,
    r.name,
    r.trophies,
    r.donations,
    r.war_wins,
    r.raw_potential_score as rpos,
    -- Dynamic PoS calculation
    ROUND((r.raw_potential_score / (SELECT value FROM elite_benchmark))::NUMERIC * 100, 1) as pos,
    -- Semantic Tier Logic 
    CASE 
        WHEN r.raw_potential_score >= 12000 THEN 'ELITE'
        WHEN r.raw_potential_score >= 10500 THEN 'HIGH'
        ELSE 'MID'
    END as tier,
    r.last_scan as last_seen_at
FROM drivers.recruits r
WHERE r.status = 'ACTIVE'
ORDER BY r.raw_potential_score DESC;
