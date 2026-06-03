// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import * as v from "valibot";
import { SafeStringPipe, SafeNumberPipe } from "./BaseSchemas";

/**
 * [GUARD] OFFLINE QUEUE SCHEMAS
 * Rationale: Hardens the deferred operations queue in IndexedDB to prevent
 * corrupted or malformed requests from being replayed to the backend.
 */
export const DismissalRequestSchema = v.object({
  id: SafeStringPipe,
  score: SafeNumberPipe,
});

export const OfflineActionSchema = v.variant("type", [
  v.object({
    type: v.literal("RECRUIT_DISMISSAL"),
    items: v.array(DismissalRequestSchema),
    timestamp: SafeNumberPipe,
  }),
  v.object({
    type: v.literal("RECRUIT_RESTORATION"),
    ids: v.array(SafeStringPipe),
    timestamp: SafeNumberPipe,
  }),
]);

export const OfflineQueueSchema = v.array(OfflineActionSchema);
