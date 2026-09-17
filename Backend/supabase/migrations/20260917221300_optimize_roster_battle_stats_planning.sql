-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR
-- Plan battle stats from the actual roster tags, not a generic parameter.
-- Keep the small, update-heavy roll-up table promptly vacuumed and analyzed.

BEGIN;

ALTER FUNCTION drivers.get_player_battle_stats(integer, text[])
    SET plan_cache_mode = force_custom_plan;

ALTER TABLE drivers.player_battle_daily
    SET (
        autovacuum_vacuum_threshold = 50,
        autovacuum_vacuum_scale_factor = 0.05,
        autovacuum_analyze_threshold = 50,
        autovacuum_analyze_scale_factor = 0.05
    );

COMMIT;
