-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- Unify Headhunter into the Features Presentation Layer
CREATE OR REPLACE VIEW features.recruits_view AS
SELECT 
    r.tag,
    r.name,
    r.trophies,
    r.donations,
    r.war_wins,
    r.raw_potential_score,
    -- Semantic Tier Logic (Clinical Logic)
    CASE 
        WHEN r.raw_potential_score >= 12000 THEN 'ELITE'
        WHEN r.raw_potential_score >= 10500 THEN 'HIGH'
        ELSE 'MID'
    END as tier,
    r.last_scan as last_seen_at
FROM drivers.recruits r
WHERE r.status = 'ACTIVE'
ORDER BY r.raw_potential_score DESC;
