-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- WHAT: drivers.on_battle_recorded() (the AFTER INSERT trigger on
-- drivers.player_battles) used to call substrate.finalize_expired_voyages()
-- on every single row insert that did NOT belong to an active voyage's time
-- window - which, since there is no active voyage most of the time, was
-- effectively every row. At current ingestion volume (~11,000
-- ingest_player_battles() calls/day, ~6,500 new battle rows/day - see
-- Backend/supabase/functions/ingest-royale-data/stages/deep-depth.ts) that
-- is ~6,500 extra small-table lookups/day for a wall-clock fact (has any
-- voyage's end_at passed?) that has nothing to do with any individual
-- battle being logged.
--
-- WHY NOW: found while investigating unrelated statement-timeout noise on
-- the project's t4g.nano box. This call was NOT the dominant cost (that was
-- the per-row insert loop, fixed in 20260923225525) but it is architecturally
-- wrong: a time-based deadline was being detected as a side effect of an
-- unrelated domain event (a battle being logged) instead of on its own
-- schedule.
--
-- WHY THIS IS SAFE TO MOVE, NOT SAFE TO JUST DELETE: finalize_expired_voyages()
-- flipping drivers.clan_voyage.status to 'COMPLETED' is user-visible in
-- near-real-time. Frontend-PWA/src/shared/ui/VoyageBanner.vue shows a live
-- countdown (Frontend-PWA/src/shared/composables/useVoyageStatus.ts) that,
-- the instant it reaches zero, fires exactly ONE store.refresh() and never
-- retries (see the `wasEnded` guard in
-- Frontend-PWA/src/shared/composables/useCountdown.ts). If the backend
-- hasn't finalized by that moment, the banner is stuck showing "Active
-- Event" in its red "Ended" state until something else calls
-- finalize_expired_voyages() again - the only other path is Postgres
-- Realtime on drivers.clan_voyage / drivers.clan_voyage_contributions
-- (Frontend-PWA/src/shared/composables/useVoyageStore.ts,
-- setupRealtimeListeners), which only fires when a write actually happens.
-- Before this migration, that write was near-guaranteed within ~30 minutes
-- (any tracked player's next battle-log poll). The only existing fallback
-- independent of battle traffic was substrate.execute_nightly_maintenance()
-- (once/day, 03:00 UTC) - an unacceptable worst case for a live countdown UI.
--
-- THE FIX: give voyage-expiry detection its own schedule (5 minutes, same
-- cadence already used by substrate.run_headhunter_epoch_guard(), see
-- 20260620142000_headhunter_epoch_guard.sql) instead of piggybacking on
-- battle inserts. This bounds finalization latency to <=5 minutes
-- unconditionally (better than the ~30-minute battle-trigger path it
-- replaces) and removes ~6,500 unnecessary per-row calls/day. Do NOT
-- "simplify" this by deleting the cron job without adding an equivalent
-- scheduled or event-driven replacement first - see the countdown/realtime
-- dependency above.

BEGIN;

CREATE OR REPLACE FUNCTION drivers.on_battle_recorded()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
DECLARE
    v_id      BIGINT;
    v_target  INT;
    v_current INT;
    v_end     TIMESTAMPTZ;
    v_name    TEXT;
    v_earned  INT;
BEGIN
    SELECT v.id, v.target_crowns, v.end_at
    INTO v_id, v_target, v_end
    FROM drivers.clan_voyage v
    WHERE v.status = 'ACTIVE'
    AND v.start_at <= NEW.battle_time
    AND v.end_at >= NEW.battle_time
    LIMIT 1;

    IF v_id IS NOT NULL THEN
        SELECT player_name INTO v_name
        FROM drivers.members
        WHERE player_tag = NEW.player_tag
          AND is_active = true
        LIMIT 1;

        -- Same allowlist refresh_voyage_contributions and
        -- on_contribution_manual_override_updated enforce. Without it, friendly
        -- and challenge battles credit voyage crowns.
        IF v_name IS NOT NULL
           AND NEW.battle_type IN ('PvP', 'pathOfLegend', 'riverRacePvP', 'riverRaceDuel', 'trail') THEN
            v_earned := NEW.team_crowns + (3 - NEW.opponent_crowns);

            INSERT INTO drivers.clan_voyage_contributions (
                voyage_id,
                player_tag,
                player_name,
                total_voyage_crowns,
                percentage_voyage_crowns
            )
            VALUES (
                v_id,
                NEW.player_tag,
                v_name,
                v_earned,
                LEAST(ROUND((v_earned::numeric / NULLIF(v_target, 0)::numeric) * 100, 2), 100.0)
            )
            ON CONFLICT (voyage_id, player_tag)
            DO UPDATE SET
                total_voyage_crowns = drivers.clan_voyage_contributions.total_voyage_crowns + EXCLUDED.total_voyage_crowns,
                percentage_voyage_crowns = LEAST(ROUND(((drivers.clan_voyage_contributions.total_voyage_crowns + EXCLUDED.total_voyage_crowns)::numeric / NULLIF(v_target, 0)::numeric) * 100, 2), 100.0),
                player_name = v_name,
                updated_at = now();
        END IF;

        SELECT SUM(total_voyage_crowns) INTO v_current
        FROM drivers.clan_voyage_contributions
        WHERE voyage_id = v_id;

        IF v_current >= v_target OR now() >= v_end THEN
            INSERT INTO drivers.clan_voyage_contributions (
                voyage_id,
                player_tag,
                player_name,
                total_voyage_crowns,
                percentage_voyage_crowns
            )
            SELECT
                v_id,
                m.player_tag,
                m.player_name,
                0,
                0.0
            FROM drivers.members m
            WHERE m.is_active = true
              AND m.player_tag NOT IN (
                  SELECT player_tag FROM drivers.clan_voyage_contributions WHERE voyage_id = v_id
              )
            ON CONFLICT (voyage_id, player_tag) DO NOTHING;

            UPDATE drivers.clan_voyage
            SET status = 'COMPLETED',
                updated_at = now()
            WHERE id = v_id;
        END IF;
    END IF;
    -- [REMOVED 2026-09-23] No longer calls substrate.finalize_expired_voyages()
    -- here when v_id IS NULL. That was a wall-clock deadline check smuggled
    -- into an unrelated per-battle trigger, firing on every battle row that
    -- didn't land inside an active voyage window (effectively almost every
    -- row, ~6,500/day). It now runs on its own cron schedule - see
    -- 'finalize-expired-voyages' below and the header comment on this
    -- migration for the user-facing latency reasoning.

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION drivers.on_battle_recorded() IS
'AFTER INSERT trigger on drivers.player_battles (tr_battle_voyage_sync), '
'FOR EACH ROW. Credits a battle''s crowns toward the active clan voyage''s '
'contributions when the battle falls inside that voyage''s [start_at, end_at] '
'window and is one of the allowlisted PvP battle types, then flips the '
'voyage to COMPLETED once its target is met or its window has passed. '
'AS OF 2026-09-23: no longer calls substrate.finalize_expired_voyages() when '
'a battle does not belong to any active voyage - that is now a dedicated '
'5-minute cron job (''finalize-expired-voyages''), decoupled from battle '
'traffic. See 20260923225809_decouple_voyage_finalization_from_battle_trigger.sql '
'for the full reasoning, including why voyage-completion latency is '
'user-visible (VoyageBanner.vue''s countdown + Realtime subscription) and '
'therefore not safe to leave undetected for more than a few minutes.';

COMMENT ON FUNCTION substrate.finalize_expired_voyages() IS
'Transitions any ACTIVE clan_voyage whose end_at has passed to COMPLETED, '
'pre-populating 0-crown contribution rows for members who did not '
'participate and pruning stale 0-crown rows for ex-members. '
'AS OF 2026-09-23: invoked by the ''finalize-expired-voyages'' pg_cron job '
'every 5 minutes (cron.job - query that table, not this comment, for the '
'live schedule). Previously it ran as a side effect of drivers.on_battle_recorded() '
'on every battle-log row that fell outside an active voyage window '
'(~6,500 calls/day); moved to its own schedule because voyage expiry is a '
'wall-clock fact, not something a battle event should be responsible for '
'detecting. Frontend-PWA/src/shared/ui/VoyageBanner.vue shows a live '
'countdown to a clan voyage''s end_at and refreshes exactly once when it '
'hits zero (Frontend-PWA/src/shared/composables/useCountdown.ts) - if this '
'function stops running on a short, predictable cadence, that banner can '
'get stuck showing an already-ended voyage as still active until the next '
'Realtime-triggered write or the once-daily nightly maintenance fallback '
'(substrate.execute_nightly_maintenance(), 03:00 UTC). Keep this on a cron '
'cadence measured in minutes, not hours.';

SELECT cron.schedule(
    'finalize-expired-voyages',
    '*/5 * * * *',
    $$SELECT substrate.finalize_expired_voyages()$$
);

COMMIT;
