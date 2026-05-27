-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

/**
 * Migration: 20260528002000_voyage_summary_add_clan_tag
 * -------------------------------------------------------
 * Problem:
 *   The voyage_summary view's `event` JSONB object was built without the
 *   `clan_tag` column. The VoyageEventSchema required it as a non-optional
 *   field, causing Valibot to throw a parse error silently caught in
 *   useVoyageStore.refresh(). The result was summary remaining permanently
 *   null and the VoyageBanner never rendering.
 *
 * Fix:
 *   Recreate features.voyage_summary to include `clan_tag` in the JSONB
 *   so the DB output fully satisfies the schema contract.
 */

-- Recreate features.voyage_summary with clan_tag included in the event JSONB
CREATE OR REPLACE VIEW features.voyage_summary AS
WITH current_voyage AS (
    SELECT *
    FROM drivers.clan_voyage
    WHERE status IN ('PENDING', 'ACTIVE')
    ORDER BY CASE WHEN status = 'ACTIVE' THEN 1 ELSE 2 END ASC, created_at DESC
    LIMIT 1
), total_stats AS (
    SELECT
        v.id AS voyage_id,
        COALESCE(SUM(c.crowns), 0) AS total_crowns
    FROM current_voyage v
    LEFT JOIN drivers.clan_voyage_contributions c ON c.voyage_id = v.id
    GROUP BY v.id
)
SELECT
    (SELECT jsonb_build_object(
        'id',            v.id,
        'clan_tag',      v.clan_tag,
        'status',        v.status,
        'target_crowns', v.target_crowns,
        'start_at',      v.start_at,
        'end_at',        v.end_at,
        'is_victory',    (ts.total_crowns >= v.target_crowns)
    ) FROM current_voyage v JOIN total_stats ts ON ts.voyage_id = v.id) AS event,
    COALESCE((SELECT ts.total_crowns FROM total_stats ts), 0) AS total_crowns,
    COALESCE(
        (SELECT (ts.total_crowns::numeric / NULLIF(v.target_crowns, 0)::numeric)
         FROM current_voyage v JOIN total_stats ts ON ts.voyage_id = v.id),
        0
    ) AS progress_ratio;

-- Re-grant SELECT to the authenticated role (idempotent)
GRANT SELECT ON features.voyage_summary TO authenticated;
