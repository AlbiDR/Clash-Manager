// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * [SHARED] SCORE TINT UTILITIES
 * ----------------------------------------------------------------------------
 * Rationale: Single source of truth for the data-driven gradient applied to
 * normalized 0-100 scores (PeS/PoS). Consumed by the `.score-tint` CSS
 * utility in @core/theme/components.ts, which reads the `--score-raw`
 * custom property this helper sets.
 * Layer: @shared/utils
 * ----------------------------------------------------------------------------
 */

const SCORE_MIN = 0;
const SCORE_MAX = 100;

/**
 * Clamps a raw score to the [0, 100] contract and exposes it as the CSS
 * custom property that drives the `.score-tint` gradient.
 *
 * @remarks
 * Backend scores are documented as "Normalized % (0-100)" but that range is
 * not enforced client-side (see MemberSchemas/RecruitSchemas), so clamping
 * here is load-bearing, not defensive noise: an out-of-range value would
 * otherwise silently saturate or invert the gradient via CSS clamp() math.
 *
 * @param score - The normalized score, or `undefined` to render no tint
 * (the `.score-tint` class should also be omitted in that case).
 */
export function scoreTintStyle(score: number | undefined): Record<string, string> {
  if (score === undefined) return {};
  const clamped = Math.min(SCORE_MAX, Math.max(SCORE_MIN, score));
  return { "--score-raw": String(clamped) };
}
