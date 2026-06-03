// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import * as v from "valibot";
import { SafeStringPipe, LaxNumberPipe, SafeNumberPipe } from "./BaseSchemas";
import { MemberSchema } from "./MemberSchemas";
import { RecruitSchema } from "./RecruitSchemas";

/**
 * [GUARD] WEB APP DATA SCHEMA
 * Authoritative validation boundary for the full application state.
 */
export const WebAppDataSchema = v.object({
  lb: v.array(MemberSchema),
  hh: v.array(RecruitSchema),
  playerTag: v.optional(SafeStringPipe),
  timestamp: SafeNumberPipe,
  dataSource: v.optional(v.picklist(["SUPABASE"])),
  remoteTimestamp: v.optional(LaxNumberPipe),
  lastCompiled: v.optional(LaxNumberPipe),
  lastFetched: v.optional(LaxNumberPipe),
  blacklist: v.optional(v.array(v.string()), []),
});
