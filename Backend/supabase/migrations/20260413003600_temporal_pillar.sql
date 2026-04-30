-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- Pillar IX: Tactical Intelligence (Temporal)
-- Syncs the PWA to the global server-side clock (10:00 UTC) for deterministic state labels.

-- CLINICAL RESET: Mandatory drop to allow column evolution
DROP VIEW IF EXISTS features.tactical_awareness_view CASCADE;

CREATE VIEW features.tactical_awareness_view AS
WITH temporal_substrate AS (
    -- Shift everything by 10 hours so "Day 0" starts at 10:00 UTC Monday
    SELECT 
        (now() AT TIME ZONE 'UTC' - INTERVAL '10 hours') as clinical_now,
        now() AT TIME ZONE 'UTC' as raw_now
),
temporal_calc AS (
    SELECT 
        ts.*,
        -- ISO Week Day (1=Mon, 7=Sun) -> Shift to 0-indexed (0=Mon, 6=Sun)
        (EXTRACT(ISODOW FROM clinical_now)::INT - 1) as day_index,
        -- Seconds until the next 10:00 UTC reset
        CASE 
            WHEN EXTRACT(HOUR FROM raw_now) >= 10 
            THEN (EXTRACT(EPOCH FROM (date_trunc('day', raw_now) + INTERVAL '1 day 10 hours' - raw_now)) / 60)::INT
            ELSE (EXTRACT(EPOCH FROM (date_trunc('day', raw_now) + INTERVAL '10 hours' - raw_now)) / 60)::INT
        END as minutes_to_reset
    FROM temporal_substrate ts
)
SELECT 
    *,
    CASE 
        WHEN day_index <= 2 THEN 'TRIAL'
        ELSE 'ENGAGEMENT'
    END as current_phase,
    CASE 
        WHEN day_index = 0 THEN 'Training Day 1'
        WHEN day_index = 1 THEN 'Training Day 2'
        WHEN day_index = 2 THEN 'Training Day 3'
        WHEN day_index = 3 THEN 'Battle Day 1'
        WHEN day_index = 4 THEN 'Battle Day 2'
        WHEN day_index = 5 THEN 'Battle Day 3'
        WHEN day_index = 6 THEN 'Battle Day 4'
    END as display_name,
    -- Colosseum awareness: Week 4 check (to be joined or refined by raw_river_race data if needed)
    EXISTS (
        SELECT 1 FROM substrate.raw_river_race 
        WHERE (payload->>'sectionIndex')::INT = 3 
        LIMIT 1
    ) as is_colosseum_week
FROM temporal_calc;

COMMENT ON VIEW features.tactical_awareness_view IS 'Global temporal sync anchored to 10:00 UTC. The source of truth for PWA phase labels.';
