// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * CORE CONFIGURATION (Layer 1)
 * ----------------------------------------------------------------------------
 * Rationale: Centralized business thresholds and operational constants.
 * Following ADR Section II, these derive from the substrate to prevent
 * "Magic Number" drift across the monorepo.
 * ----------------------------------------------------------------------------
 */

/**
 * Authoritative TTL (Time-To-Live) for clan data staleness.
 * Marks data as 'STALE' if older than 30 minutes to prompt background refresh.
 *
 * @remarks
 * [DECISION LOG] CACHE DURATION:
 * A 30-minute window balances data freshness with API rate limit conservation
 * and device battery preservation.
 */
export const DATA_STALENESS_THRESHOLD = 1000 * 60 * 30; // 30 minutes

/**
 * Logical representation of staleness in minutes for UI and status resolution.
 */
export const DATA_STALENESS_MINUTES = 30;

/**
 * Threshold for triggering a background refresh on app visibility change.
 * If the app has been hidden for more than 30 minutes, a fresh sync is initiated.
 *
 * @remarks
 * [THREAT:] POLLING OVERHEAD:
 * Excessive background syncs on every visibility change would cause battery drain
 * and unnecessary network traffic.
 *
 * [DECISION LOG] COOLDOWN PERIOD:
 * Aggressive refresh only occurs after significant idle time (30m), ensuring
 * that returning users see fresh data without taxing the system on every tab switch.
 */
export const VISIBILITY_REFRESH_THRESHOLD = 30 * 60 * 1000; // 30 minutes

/**
 * Interval for polling Supabase while the app stays open and foregrounded.
 *
 * @remarks
 * [THREAT:] UNBOUNDED SESSION STALENESS:
 * The visibility-change refresh only fires after VISIBILITY_REFRESH_THRESHOLD
 * of being backgrounded. A tab left open and foregrounded continuously (never
 * backgrounded, never re-navigated) previously never refetched again after its
 * initial load, so roster data (member list, last-seen timestamps) could drift
 * arbitrarily far from the backend regardless of how fresh the backend was.
 *
 * [DECISION LOG] FOREGROUND POLL:
 * 5 minutes matches the roster's practical freshness needs while staying well
 * under the 30-minute backend ingest cadence multiple times over.
 */
export const FOREGROUND_POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes

/**
 * Default score threshold used for recruitment prioritization and batch selection.
 *
 * @remarks
 * [DECISION LOG] ELITE BASELINE:
 * 75% matches the "Elite" recruiter definition established in ADR Section VII,
 * acting as the default filter for high-potential targets.
 */
export const DEFAULT_SCORE_THRESHOLD = 75;

/** Lowest selectable score threshold. Admits the whole roster. */
export const SCORE_THRESHOLD_MIN = 0;

/** Highest selectable score threshold. Performance and Potential are both percentages. */
export const SCORE_THRESHOLD_MAX = 100;

/**
 * Granularity of the score threshold selector.
 *
 * @remarks
 * [DECISION LOG] SELECTION GRANULARITY:
 * The selector previously offered seven fixed stops 15 points apart, which is
 * coarse enough that the wanted threshold routinely fell between two of them.
 * A 5-point step yields 21 reachable values. That is unusable as a row of
 * buttons, which is precisely why the control is now a slider.
 */
export const SCORE_THRESHOLD_STEP = 5;

/**
 * Every reachable score threshold, derived from the domain and its step.
 *
 * @remarks
 * Drives magnetic snapping and arrow-key walking. Which of these are drawn as
 * ticks is a presentation decision owned by the consuming component, since a
 * 48px pill cannot legibly carry 21 of them.
 */
export const SCORE_THRESHOLD_DETENTS: readonly number[] = Array.from(
  { length: (SCORE_THRESHOLD_MAX - SCORE_THRESHOLD_MIN) / SCORE_THRESHOLD_STEP + 1 },
  (_unused, stepIndex) => SCORE_THRESHOLD_MIN + stepIndex * SCORE_THRESHOLD_STEP,
);

/**
 * Interval between drawn tick marks on the score track.
 *
 * @remarks
 * [DECISION LOG] TICK DENSITY IS NOT DETENT DENSITY:
 * Drawing all 21 detents on a 48px pill produces a solid band that reads as
 * texture rather than as a scale. Quartile ticks orient the eye; the detents
 * underneath stay at 5.
 */
export const SCORE_TICK_INTERVAL = 25;

/**
 * Radius, in rendered pixels, within which a drag is pulled onto a detent.
 *
 * @remarks
 * [DECISION LOG] MAGNETIC PULL:
 * 6px is close to half a fingertip's positional error and comfortably below the
 * spacing of the densest detent set in the stack, so the pull assists aim
 * without ever making an intermediate value unreachable.
 */
export const SLIDER_SNAP_RADIUS_PX = 6;

/**
 * Default crown target for new Clan Voyage events.
 *
 * @remarks
 * [DECISION LOG] TARGET BASELINE:
 * 1600 crowns represents a conservative starting point for small clans,
 * derived from the average activity seen in tier-1 test clans.
 */
export const VOYAGE_DEFAULT_TARGET = 1600;

/**
 * Hard upper bound for Clan Voyage crown targets.
 *
 * @remarks
 * [DECISION LOG] NUMERIC CAP:
 * Prevents numeric overflow and UI distortion in progress charts.
 */
export const VOYAGE_MAX_TARGET = 9999;

/**
 * CORE TIMING CONSTANTS (Layer 1)
 * ----------------------------------------------------------------------------
 * Rationale: Centralizes UI/UX stability delays and orchestration timeouts.
 */

/**
 * Delay to avoid clashing with initial render/font loading in headless environments.
 *
 * @remarks
 * [DECISION LOG] STABILITY WINDOW:
 * A 1.5s delay ensures that web fonts and base layout are stabilized before
 * the app concludes its initial loading state, preventing cumulative layout shift (CLS).
 */
export const UI_STABILITY_DELAY = 1500;

/**
 * Minimum interval between badge updates to prevent API flooding.
 *
 * @remarks
 * [THREAT:] OS RATE LIMITING:
 * Some platforms (especially Android/iOS via PWA wrappers) may rate-limit or
 * ignore rapid, consecutive updates to the application badge.
 */
export const BADGE_UPDATE_DEBOUNCE = 1500;

/**
 * Base delay for exponential backoff during failed badge updates.
 *
 * @remarks
 * [DECISION LOG] RETRY BACKOFF:
 * 800ms provides a sufficient window for transient network recovery without
 * introducing perceptible lag in the background update lifecycle.
 */
export const BADGE_RETRY_BASE_DELAY = 800;

/**
 * Canonical public repository URL.
 *
 * @remarks
 * [DECISION LOG] SINGLE SOURCE OF TRUTH:
 * The repository address previously appeared as a bare literal in both
 * AboutSettings.vue and UsefulLinksSettings.vue, leaving nothing to stop the
 * two from drifting apart. Provenance destinations resolve from here so the
 * address is stated once.
 */
export const REPOSITORY_URL = "https://github.com/AlbiDR/Clash-Manager";

/**
 * Issue tracker entry point, derived from {@link REPOSITORY_URL}.
 */
export const REPOSITORY_ISSUES_URL = `${REPOSITORY_URL}/issues/new`;

/**
 * Shortest permitted profile dwell time, in milliseconds.
 *
 * @remarks
 * [DECISION LOG] HUMAN EMULATION FLOOR:
 * 850ms mimics a fast human interaction speed while staying within OS-level
 * deep-link polling limits. It is a floor rather than merely a default: below
 * it the deep link has not resolved when the tap fires, so the tap lands on
 * nothing and a run reports far more invites than it actually sent. The failure
 * is silent, which is why the bound is enforced and drawn rather than implied.
 */
export const BLITZ_DWELL_MIN = 850;

/**
 * Longest permitted profile dwell time, in milliseconds.
 *
 * @remarks
 * [DECISION LOG] TOLERANCE CEILING:
 * No Clash Royale profile takes longer than this to render, so time beyond it
 * is not latency tolerance, only waiting. The previous ladder topped out at
 * 12000ms, which made a 40-player run take eight minutes and left that rung
 * with no practical use.
 */
export const BLITZ_DWELL_MAX = 6000;

/** Fine adjustment granularity for dwell time, in milliseconds. */
export const BLITZ_DWELL_STEP = 10;

/**
 * Dwell time applied until the operator chooses one.
 *
 * @remarks
 * [DECISION LOG] EQUAL TODAY, NOT THE SAME THING:
 * This holds the same value as {@link BLITZ_DWELL_MIN}, and a static analyser
 * reads the pair as a duplicate export to collapse. It is not one. The floor is
 * a safety bound - below it the deep link has not resolved when the tap fires -
 * while this is a starting position the operator is free to raise. Collapsing
 * them would make retuning the floor silently relocate every operator who had
 * never moved the slider. Deriving from the floor is deliberate: the default
 * must never start below it.
 *
 * This was previously also exported a third time as BLITZ_THROTTLE_DEFAULT, a
 * second name for this same fallback, which is the duplication that was real.
 */
export const BLITZ_DWELL_DEFAULT = BLITZ_DWELL_MIN;

/**
 * Suggested dwell times the handle is magnetically pulled onto.
 *
 * @remarks
 * [DECISION LOG] GEOMETRIC SPACING:
 * Spaced at a roughly constant ratio rather than a constant difference, because
 * latency tolerance is perceived multiplicatively: 850ms to 1500ms is the same
 * felt step as 3000ms to 5100ms. The track itself is logarithmic for the same
 * reason, so these land at even visual intervals.
 */
export const BLITZ_DWELL_DETENTS: readonly number[] = [
  850, 1500, 2100, 3000, 4200, 5100, 6000,
];

/** The three-tier speed names this control replaced. */
export type LegacyBlitzSpeed = "fast" | "medium" | "slow";

/**
 * Dwell time each retired speed name maps onto.
 *
 * @remarks
 * [DECISION LOG] MIGRATION ONLY:
 * Retained solely so a setting persisted before the slider shipped resolves to
 * the equivalent dwell time instead of silently reverting to the default. Not
 * for use by new code, and removable once no stored payload can still carry a
 * string. `medium` and `slow` map to the rebalanced ladder rather than to their
 * original 6000ms and 12000ms, both of which sat outside the domain the control
 * now exposes.
 */
export const BLITZ_LEGACY_SPEED_DWELL: Record<LegacyBlitzSpeed, number> = {
  fast: 850,
  medium: 2100,
  slow: 5100,
};


/**
 * Safety delay for automated blitz to ensure stable deep-link resolution.
 *
 * @remarks
 * [DECISION LOG] RESOLUTION STABILITY:
 * 4s allows the native OS to process the deep-link and for the target app
 * to reach a stable rendering state before the automated sequencer proceeds.
 */
export const BLITZ_SAFETY_DELAY = 4000;

/**
 * Reset timer for auto-advance after manual interaction in Blitz Mode.
 *
 * @remarks
 * [DECISION LOG] INTERACTION COOLDOWN:
 * A 2s pause ensures that manual user actions are not immediately overridden
 * by the automated sequencer, allowing for human-in-the-loop adjustments.
 */
export const BLITZ_RECOVERY_DELAY = 2000;

/**
 * Delay before concluding the Blitz sequence.
 *
 * @remarks
 * [DECISION LOG] SEQUENCE TERMINATION:
 * A 1.5s terminal delay provides visual closure for the user before the
 * Blitz overlay or status indicator is dismissed.
 */
export const BLITZ_COMPLETION_DELAY = 1500;

/**
 * Micro-delay for processing the internal batch queue.
 *
 * @remarks
 * [DECISION LOG] BATCH PACING:
 * 150ms provides enough breathing room for the JS main thread to process
 * DOM updates between rapid queue shifts.
 */
export const BLITZ_BATCH_SHIFT_DELAY = 150;

/**
 * Non-blocking timeout for blocked IndexedDB deletions.
 *
 * @remarks
 * [THREAT:] DATABASE LOCKS:
 * In multi-tab environments, an IndexedDB instance may be locked by another
 * context, preventing deletion of legacy or maintenance data.
 *
 * [DECISION LOG] NON-BLOCKING EVICTION:
 * A 1.5s timeout ensures maintenance tasks do not hang the UI thread if
 * a resource is contested.
 */
export const STORAGE_DELETE_TIMEOUT = 1500;

/**
 * Notification tag used to deduplicate and manage recruit push notifications.
 * Must be kept in sync with the PWA manifest shortcut and sw.ts routing.
 */
export const NOTIFICATION_TAG_RECRUIT = "com.app.RECRUIT_UPDATES";

/**
 * Shortcut ID referenced in push notification payloads for native deep linking
 * into the headhunter route via the PWA app shortcut.
 */
export const NOTIFICATION_SHORTCUT_ID = "recruit_shortcut_id";

/**
 * AUTHORITATIVE STORAGE CONSTANTS (Layer 1)
 * ----------------------------------------------------------------------------
 * Rationale: Centralizes IndexedDB configuration to ensure consistency
 * between the main UI thread and the Service Worker substrate.
 */

/** Primary database name for local persistence. */
export const STORAGE_DB_NAME = "clash_manager_v14";
/** Standard object store name for key-value pairs. */
export const STORAGE_STORE_NAME = "keyval";
/** Current IndexedDB schema version. */
export const STORAGE_DB_VERSION = 1;

/** Legacy database name for migration logic. */
export const STORAGE_LEGACY_DB_NAME = "clash_manager_db";
/** Legacy object store name for migration logic. */
export const STORAGE_LEGACY_STORE_NAME = "key_val_store";

/** Registry of all deprecated database names to be purged during maintenance. */
export const STORAGE_DEPRECATED_DB_NAMES = [
  "clash_manager_db",
  "clash_manager",
  "clash-manager",
  "clash_manager_v1",
  "clash_manager_v2",
  "clash_manager_v3",
  "clash_manager_v4",
  "clash_manager_v5",
  "clash_manager_v6",
  "clash_manager_v7",
  "clash_manager_v8",
  "clash_manager_v9",
  "clash_manager_v10",
  "clash_manager_v11",
  "clash_manager_v12",
  "clash_manager_v13"
];

/**
 * Cooldown duration for backend manual updates in seconds.
 *
 * @remarks
 * [DECISION LOG] COOLDOWN SEGREGATION:
 * 60 seconds provides an optimal window to protect backend databases and
 * Edge Functions from rapid, redundant manual trigger spam, while remaining
 * brief enough to satisfy typical user patience on a retry.
 */
export const BACKEND_REFRESH_COOLDOWN_SECONDS = 60;

/**
 * Cooldown interval timer step in milliseconds.
 *
 * @remarks
 * [DECISION LOG] TIMER RESOLUTION:
 * 1000ms (1 second) provides a standard human-perceptible countdown step for the
 * visual UI refresher badge without incurring excessive Vue reactive re-renders.
 */
export const BACKEND_REFRESH_COOLDOWN_INTERVAL = 1000;

/**
 * Hard safety limit on total simulation iterations in the laboratory engine.
 *
 * @remarks
 * [THREAT:] INFINITE SIMULATION LOOP:
 * A malformed roster, corrupt settings, or an unreachable level target could
 * drive the greedy priority-queue generator into an infinite loop, causing
 * severe memory exhaustion or application freeze.
 *
 * [DECISION LOG] SAFETY CEILING:
 * 5000 iterations is a safe mathematical ceiling. For a maximum king level of
 * 16 per card across 115 cards, the absolute upper bound of possible upgrades
 * is less than 2000. 5000 therefore allows complete coverage while acting as
 * an absolute runtime circuit breaker.
 */
export const SIMULATION_MAX_ITERATIONS = 5000;
