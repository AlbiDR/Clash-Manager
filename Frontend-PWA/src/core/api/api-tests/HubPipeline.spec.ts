// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * [INTEGRATION] HUB PIPELINE VALIDATION
 * Simulates the exact data flow from raw Worker matrix rows through mapLbRow/mapHhRow
 * and validates the output against the authoritative MemberSchema, RecruitSchema,
 * and WebAppDataSchema — replicating the validation the store performs on fetchRemote output.
 */

import { describe, it, expect } from "vitest";
import * as v from "valibot";
import { MemberSchema, RecruitSchema, WebAppDataSchema } from "../DataSchemas";
import { mapLbRow, mapHhRow, createSchemaMap } from "../GasClient";

// Raw matrix schemas built by the Hub detection path (GasClient.ts lines 687-690, 704-706)
const RAW_LB_SCHEMA = [
  "_", "id", "n", "role", "t", "days", "req", "avg", "tot", "seen", "rate", "wfame",
  "hist", "performanceRawScore", "performanceScore", "trend"
];

const RAW_HH_SCHEMA = [
  "_", "id", "invited", "n", "t", "don", "cards", "war", "ago", "potentialRawScore", "potentialScore", "lastScan"
];

// Exact data rows from live Worker Hub (captured 2026-04-03)
const REAL_LB_ROW = [
  "", "#PP80QG99", "ADR", "leader", 12302, 131, 312, 101, 13236,
  "2026-04-03T18:50:46.000Z", 0.92, 2036,
  "1200 26W14 | 1850 26W13 | 1800 26W12", 59270, 100, 0, ""
];

const REAL_HH_ROW = [
  "", "#890YR8VL9", "", "KENNY^_^", 25748, 137073, 10670, 84,
  "2026-04-03T19:04:05.000Z", 41135, 100, "03/04/2026 23:03", ""
];

describe("Hub Pipeline Validation", () => {
  const lbMap = createSchemaMap(RAW_LB_SCHEMA);
  const hhMap = createSchemaMap(RAW_HH_SCHEMA);

  it("mapLbRow produces a valid LeaderboardMember from raw Worker row", () => {
    const member = mapLbRow(REAL_LB_ROW, lbMap);
    expect(member).not.toBeNull();

    const result = v.safeParse(MemberSchema, member);
    if (!result.success) {
      console.error("MemberSchema failures:", JSON.stringify(result.issues, null, 2));
    }
    expect(result.success).toBe(true);
  });

  it("mapHhRow produces a valid Recruit from raw Worker row", () => {
    const recruit = mapHhRow(REAL_HH_ROW, hhMap);
    expect(recruit).not.toBeNull();

    const result = v.safeParse(RecruitSchema, recruit);
    if (!result.success) {
      console.error("RecruitSchema failures:", JSON.stringify(result.issues, null, 2));
    }
    expect(result.success).toBe(true);
  });

  it("full inflated WebAppData payload passes WebAppDataSchema", () => {
    const member = mapLbRow(REAL_LB_ROW, lbMap)!;
    const recruit = mapHhRow(REAL_HH_ROW, hhMap)!;

    const now = Date.now();
    const payload = {
      lb: [member],
      hh: [recruit],
      playerTag: "",
      timestamp: now,
      dataSource: "WORKER" as const,
      hubTimestamp: now,
      lastCompiled: now,
      lastFetched: now,
    };

    const result = v.safeParse(WebAppDataSchema, payload);
    if (!result.success) {
      console.error("WebAppDataSchema failures:", JSON.stringify(result.issues, null, 2));
    }
    expect(result.success).toBe(true);
  });
});
