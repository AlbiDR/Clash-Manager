// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import * as v from "valibot";
import { SafeStringPipe, LaxNumberPipe, SafeNumberPipe } from "./BaseSchemas";
import { MemberSchema } from "./MemberSchemas";
import { RecruitSchema } from "./RecruitSchemas";

/**
 * [GUARD] WEB APP DATA SCHEMA
 * Authoritative validation boundary for the full application state.
 *
 * @remarks
 * Satisfies ADR Section III: Validation Boundaries.
 * This schema defines the structural integrity of the application's
 * primary data singleton, ensuring that data fetched from Supabase
 * views or IndexedDB cache conforms to expected domain models.
 *
 * [THREAT:] Structural drift in the backend views or corruption in
 * IndexedDB can lead to UI deadlocks or runtime crashes if this
 * boundary is bypassed or weakened.
 *
 * [DECISION LOG]
 * - 'lb' and 'hh' are validated against their respective sub-schemas
 *   to ensure deep structural integrity.
 * - 'playerTag' is optional but piped to ensure consistent formatting.
 * - 'timestamp' is mandatory as the authoritative age of the dataset.
 */
export const WebAppDataSchema = v.object({
  /** Authoritative roster dataset (Leaderboard). */
  lb: v.array(MemberSchema),
  /** Authoritative headhunter dataset (Recruits). */
  hh: v.array(RecruitSchema),
  /** The tag of the authenticated/primary player. */
  playerTag: v.optional(SafeStringPipe),
  /** The unix timestamp of the data ingestion. */
  timestamp: SafeNumberPipe,
  /** The source of the data (currently restricted to 'SUPABASE'). */
  dataSource: v.optional(v.picklist(["SUPABASE"])),
  /** The timestamp when the data was last synchronized with the remote. */
  remoteTimestamp: v.optional(LaxNumberPipe),
  /** The timestamp when the data was last compiled into a bundle. */
  lastCompiled: v.optional(LaxNumberPipe),
  /** The timestamp when the data was last fetched from the API. */
  lastFetched: v.optional(LaxNumberPipe),
  /** List of blacklisted player tags to be filtered from the UI. */
  blacklist: v.optional(v.array(v.string()), []),
});
