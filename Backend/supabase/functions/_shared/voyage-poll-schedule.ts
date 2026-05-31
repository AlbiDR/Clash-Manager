// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * Smart Voyage Ingestion Prioritization
 *
 * During an active Clan Voyage event, every member's battle log is polled
 * on a per-player adaptive schedule rather than a flat clan-wide interval.
 * The schedule is derived from two inputs:
 *
 *   - `lastSeenAgoHours`: how long ago the player was last seen in-game
 *     (sourced from `drivers.members.last_seen_at` via the roster endpoint).
 *   - `voyageRemainingSeconds`: seconds until the active voyage closes
 *     (NULL or 0 when no voyage is active).
 *
 * The core invariant is:
 *
 *   T_poll = BATTLE_LOG_API_WINDOW * V_match
 *
 * where `V_match` is the assumed minimum match duration for a player in
 * a given activity tier. A higher velocity means the player is assumed
 * to play more slowly, so polling can be relaxed without risking overflow
 * of the API's 25-battle rolling buffer.
 *
 * @see {@link drivers.get_voyage_poll_interval_seconds} for the SQL equivalent.
 */

/**
 * Maximum number of battles the Clash Royale battle log API returns
 * in a single response. This is an external API constraint and the
 * mathematical foundation of the polling interval formula.
 */
export const BATTLE_LOG_API_WINDOW = 25;

/**
 * Tier boundary thresholds in hours since last seen.
 * Each boundary represents a distinct player activity pattern.
 * All values are in hours.
 */
export const VOYAGE_TRACKING_BOUNDARIES_HOURS = {
    /** Player is likely mid-session or just finished one. */
    ACTIVE_SESSION:  3,
    /** Player likely just closed the app after a recent session. */
    RECENT_CLOSE:    6,
    /** Player who checks in every few hours throughout the day. */
    INTERMITTENT:   12,
    /** Standard work or study block without in-game activity. */
    DAYTIME_BLOCK:  18,
    /** Full day sleep cycle; no activity expected until morning. */
    SLEEP_CYCLE:    24,
    /** Short multi-day absence; still a regular player. */
    SHORT_ABSENCE:  48,
    /** Mid-length absence spanning a few days. */
    MID_ABSENCE:    72,
    /** Extended absence of several days. */
    LONG_ABSENCE:  120,
    /** Player approaching a week of inactivity. */
    DORMANT:       168,
} as const;

/**
 * Target velocity per tier: the assumed minimum match duration in seconds.
 * Each value represents the shortest realistic battle length for a player
 * in that activity state.
 *
 * The polling interval for each tier is:
 *   interval = BATTLE_LOG_API_WINDOW * velocity
 *
 * Tier 1 (72 s) anchors to the current 30-minute cron interval.
 * Tier 10 (300 s) is the final dormant anchor; at 25 * 300 = 7,500 s
 * (125 min), no player can overflow the API buffer even playing at the
 * physical maximum realistic pace.
 */
export const VOYAGE_TRACKING_VELOCITIES_SECONDS = {
    T1_ACTIVE_SESSION:  72,  // 01:12 — anchor; matches current cron interval
    T2_RECENT_CLOSE:    80,  // 01:20
    T3_INTERMITTENT:    90,  // 01:30
    T4_DAYTIME_BLOCK:  100,  // 01:40
    T5_SLEEP_CYCLE:    120,  // 02:00
    T6_SHORT_ABSENCE:  150,  // 02:30
    T7_MID_ABSENCE:    180,  // 03:00
    T8_LONG_ABSENCE:   216,  // 03:36
    T9_DORMANT:        288,  // 04:48 — hard physical safety limit
    T10_ANCHOR:        300,  // 05:00 — final dormant anchor
} as const;

/**
 * Computes the number of seconds until a given player's battle log
 * should next be polled.
 *
 * @param lastSeenAgoHours     - Hours since the player was last seen in-game.
 * @param voyageRemainingSeconds - Seconds until the active voyage closes,
 *                                 or null when no voyage is active.
 * @returns Polling interval in seconds.
 */
export function getFinalPollIntervalSeconds(
    lastSeenAgoHours: number,
    voyageRemainingSeconds: number | null,
): number {
    const B = VOYAGE_TRACKING_BOUNDARIES_HOURS;
    const V = VOYAGE_TRACKING_VELOCITIES_SECONDS;

    let targetVelocitySeconds: number;

    if      (lastSeenAgoHours <= B.ACTIVE_SESSION) targetVelocitySeconds = V.T1_ACTIVE_SESSION;
    else if (lastSeenAgoHours <= B.RECENT_CLOSE)   targetVelocitySeconds = V.T2_RECENT_CLOSE;
    else if (lastSeenAgoHours <= B.INTERMITTENT)   targetVelocitySeconds = V.T3_INTERMITTENT;
    else if (lastSeenAgoHours <= B.DAYTIME_BLOCK)  targetVelocitySeconds = V.T4_DAYTIME_BLOCK;
    else if (lastSeenAgoHours <= B.SLEEP_CYCLE)    targetVelocitySeconds = V.T5_SLEEP_CYCLE;
    else if (lastSeenAgoHours <= B.SHORT_ABSENCE)  targetVelocitySeconds = V.T6_SHORT_ABSENCE;
    else if (lastSeenAgoHours <= B.MID_ABSENCE)    targetVelocitySeconds = V.T7_MID_ABSENCE;
    else if (lastSeenAgoHours <= B.LONG_ABSENCE)   targetVelocitySeconds = V.T8_LONG_ABSENCE;
    else if (lastSeenAgoHours <= B.DORMANT)        targetVelocitySeconds = V.T9_DORMANT;
    else                                           targetVelocitySeconds = V.T10_ANCHOR;

    let pollingIntervalSeconds = BATTLE_LOG_API_WINDOW * targetVelocitySeconds;

    // Apply voyage remaining time as a ceiling.
    // This guarantees every player is polled at least once more
    // before the event closes, regardless of their inactivity tier.
    if (voyageRemainingSeconds !== null && voyageRemainingSeconds > 0) {
        pollingIntervalSeconds = Math.min(pollingIntervalSeconds, voyageRemainingSeconds);
    }

    return pollingIntervalSeconds;
}
