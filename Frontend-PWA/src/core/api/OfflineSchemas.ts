// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import * as v from "valibot";
import { SafeStringPipe, SafeNumberPipe } from "./BaseSchemas";

/**
 * [GUARD] DISMISSAL REQUEST SCHEMA
 * Validates a single recruit dismissal request within the offline queue.
 *
 * @remarks
 * Satisfies ADR Section III: Validation Boundaries.
 *
 * [DECISION LOG]
 * - 'id' is piped through SafeStringPipe to ensure player tag consistency.
 * - 'score' is captured to preserve the context of dismissal for backend auditing.
 */
export const DismissalRequestSchema = v.object({
  /** The unique player tag of the recruit being dismissed. */
  id: SafeStringPipe,
  /** The calculated score at the time of dismissal. */
  score: SafeNumberPipe,
});

/**
 * [GUARD] OFFLINE ACTION SCHEMA
 * Validates a polymorphic offline action before it is persisted to IndexedDB.
 *
 * @remarks
 * Satisfies ADR Section III: Validation Boundaries.
 * This variant schema handles the different types of deferred operations
 * supported by the Service Worker synchronization engine.
 *
 * [THREAT:] Malformed or stale offline actions can cause replay failures
 * or inconsistent state between the local cache and remote database.
 */
export const OfflineActionSchema = v.variant("type", [
  v.object({
    /** Dismissal of recruits. */
    type: v.literal("RECRUIT_DISMISSAL"),
    /** The batch of recruits to be dismissed. */
    items: v.array(DismissalRequestSchema),
    /** The unix timestamp when the action was queued. */
    timestamp: SafeNumberPipe,
  }),
  v.object({
    /** Restoration of previously dismissed recruits. */
    type: v.literal("RECRUIT_RESTORATION"),
    /** The batch of player tags to be restored. */
    ids: v.array(SafeStringPipe),
    /** The unix timestamp when the action was queued. */
    timestamp: SafeNumberPipe,
  }),
]);

/**
 * [GUARD] OFFLINE QUEUE SCHEMA
 * Validates the entire collection of pending offline actions.
 *
 * @remarks
 * Satisfies ADR Section III: Validation Boundaries.
 */
export const OfflineQueueSchema = v.array(OfflineActionSchema);
