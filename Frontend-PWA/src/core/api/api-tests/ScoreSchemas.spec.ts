// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect } from "vitest";
import * as v from "valibot";
import { ScoreCompositionSchema, OptionalScoreCompositionSchema } from "../ScoreSchemas";
import { SbRosterRowSchema } from "../MemberSchemas";
import { SbHeadhunterRowSchema } from "../RecruitSchemas";
import { mapSbRosterRow, mapSbHeadhunterRow } from "../DataMappers";

const composition = {
  contributions: [{ key: "trophies" as const, points: 1000 }],
  adjustments: [{ key: "inactivity" as const, points: -200, factor: 0.8 }],
  rawScore: 800, normalizedScore: 80, scoreBonus: 0, referenceScore: 1000,
  referenceScope: "clan" as const,
};

describe("Score calculation snapshots", () => {
  it("rejects a plausible but unreconciled explanation", () => {
    expect(v.safeParse(ScoreCompositionSchema, { ...composition, rawScore: 900 }).success).toBe(false);
  });

  it.each([NaN, Infinity, -Infinity])("rejects non-finite points (%s)", points => {
    expect(v.safeParse(ScoreCompositionSchema, {
      ...composition, contributions: [{ key: "trophies", points }],
    }).success).toBe(false);
  });

  it("keeps profiles readable when an explanation is absent or malformed", () => {
    for (const value of [null, undefined, {}, { ...composition, rawScore: 900 }]) {
      expect(v.parse(OptionalScoreCompositionSchema, value)).toBeUndefined();
    }
  });

  it("preserves full precision through the roster mapping and cache schema", () => {
    const row = v.parse(SbRosterRowSchema, {
      raw_performance_score: 800, performance_score: 80, score_composition: composition,
    });
    expect(mapSbRosterRow(row).scoreComposition).toEqual(composition);
  });

  it("suppresses a snapshot when either score no longer matches its profile", () => {
    for (const scores of [
      { raw_performance_score: 900, performance_score: 80 },
      { raw_performance_score: 800, performance_score: 90 },
    ]) {
      const row = v.parse(SbRosterRowSchema, { ...scores, score_composition: composition });
      expect(mapSbRosterRow(row).scoreComposition).toBeUndefined();
    }
    const row = v.parse(SbHeadhunterRowSchema, {
      raw_potential_score: 800, potential_score: 90,
      score_composition: { ...composition, referenceScope: "recruitment" },
    });
    expect(mapSbHeadhunterRow(row).scoreComposition).toBeUndefined();
  });
});
