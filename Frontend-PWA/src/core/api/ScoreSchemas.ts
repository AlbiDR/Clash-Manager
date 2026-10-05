// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import * as v from "valibot";

const FiniteNumberSchema = v.pipe(v.number(), v.finite());
const ScoreTermSchema = v.object({
  key: v.picklist([
    "current_fame", "average_fame", "donations", "trophies", "participation", "voyage",
    "weighted_win_rate", "legacy_war_wins", "challenge_cards", "grand_challenge",
    "baseline_rounding", "final_rounding", "loyalty", "inactivity",
  ]),
  points: FiniteNumberSchema,
  factor: v.optional(FiniteNumberSchema),
});

/** Authoritative calculation snapshot; absent on older cached data or unscanned recruits. */
export const ScoreCompositionSchema = v.pipe(v.object({
  contributions: v.array(ScoreTermSchema),
  adjustments: v.array(ScoreTermSchema),
  rawScore: FiniteNumberSchema,
  normalizedScore: FiniteNumberSchema,
  scoreBonus: FiniteNumberSchema,
  referenceScore: v.nullable(FiniteNumberSchema),
  referenceScope: v.picklist(["clan", "recruitment"]),
  stability: v.optional(FiniteNumberSchema),
}), v.check((score) => {
  const terms = [...score.contributions, ...score.adjustments];
  const total = terms.reduce((sum, term) => sum + term.points, 0);
  const magnitude = terms.reduce((sum, term) => sum + Math.abs(term.points), Math.abs(score.rawScore));
  return terms.length > 0 && Math.abs(total - score.rawScore) <=
    Number.EPSILON * Math.max(1, magnitude) * terms.length;
}, "Score contributions must reconcile with the raw total"));

// An unavailable explanation must not discard the player's otherwise valid profile.
export const OptionalScoreCompositionSchema = v.fallback(v.optional(ScoreCompositionSchema), undefined);
export type ScoreComposition = v.InferOutput<typeof ScoreCompositionSchema>;
