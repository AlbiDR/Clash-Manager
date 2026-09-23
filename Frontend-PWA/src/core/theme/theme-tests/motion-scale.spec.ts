// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
/**
 * CLASH MANAGER - Motion Scale Firewall
 * ----------------------------------------------------------------------------
 * Fails the build on a transition or animation timed to a value the design
 * system does not declare.
 *
 * @remarks
 * Typography drifted to zero off-scale values because the type scale was
 * enforced. Motion drifted to thirteen because it was not: an audit on
 * 2026-09-14 found thirty-three declarations between 150ms and 4s that matched
 * no token, including the same spinner gesture running at 1s in two components
 * and 1.5s in a third, and four different slow pulses at 2s, 2.5s, 3s and 4s.
 * None of that is reportable as a bug and all of it is felt.
 *
 * [DECISION LOG] The permitted set is read out of `base.ts` rather than listed
 * here. A hardcoded list has to be edited whenever the scale grows, the edit is
 * easy to forget, and a forgotten edit fails silently in the worst direction -
 * the check keeps passing while permitting a token that no longer exists. Read
 * from source, adding a token widens this check by itself.
 *
 * [THREAT:] A check that could not read the scale at all would find every
 * duration off-scale and fail loudly, which is safe. The dangerous inverse is
 * an empty corpus reporting success, so the counts are asserted too: if the
 * walker ever stops seeing components, that is a failure and not a pass.
 * ============================================================================
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  walkSource,
  styleBodies,
  readScale,
  durationLiterals,
  inlineStyles,
} from './style-corpus';
import { animationStyles } from '../animations';

const SRC_DIR = join(__dirname, '..', '..', '..');
const BASE_TOKENS = readFileSync(join(__dirname, '..', 'base.ts'), 'utf8');

/** Every duration the design system declares, interaction and ambient alike. */
const PERMITTED_MS = new Set([
  ...readScale(BASE_TOKENS, 'motion-duration', 'ms'),
  ...readScale(BASE_TOKENS, 'motion-ambient', 'ms'),
]);

/**
 * Zero is permitted because it means "no transition", which is a statement
 * rather than a timing. It is not the same as the near-zero values the reduced
 * motion block in `animations.ts` documents as a fault: those suppress
 * `transitionend` and strand any handler waiting on it, so they are rejected.
 */
const NEAR_ZERO_CEILING_MS = 1;

interface Finding {
  location: string;
  ms: number;
  text: string;
}

const files = walkSource(SRC_DIR);
const findings: Finding[] = [];
let inspectedBodies = 0;

/**
 * A `<style>` block and a static `style=` attribute are the same surface as far
 * as these rules are concerned, so they are read as one list.
 */
const surfaces = (file: string): { css: string; startLine: number }[] => [
  ...styleBodies(file),
  ...inlineStyles(file).map(({ css, line }) => ({ css, startLine: line })),
];

for (const file of files) {
  for (const { css, startLine } of surfaces(file)) {
    inspectedBodies += 1;
    for (const { ms, line, text } of durationLiterals(css)) {
      if (ms === 0 || PERMITTED_MS.has(ms)) continue;
      findings.push({
        location: `${file.slice(SRC_DIR.length + 1)}:${startLine + line - 1}`,
        ms,
        text,
      });
    }
  }
}

const report = (rows: Finding[]): string =>
  rows.map((row) => `  ${row.location}  ${row.ms}ms  ${row.text.slice(0, 78)}`).join('\n');

describe('motion scale', () => {
  it('reads a non-empty scale and a non-empty corpus', () => {
    // Without this the suite could pass by finding nothing anywhere.
    expect(PERMITTED_MS.size).toBeGreaterThan(6);
    expect(files.length).toBeGreaterThan(50);
    expect(inspectedBodies).toBeGreaterThan(50);
  });

  it('times every transition and animation to a declared token', () => {
    expect(findings, `durations that match no token:\n${report(findings)}`).toEqual([]);
  });

  it('never suppresses transitionend with a near-zero duration', () => {
    const nearZero = findings.filter(
      (finding) => finding.ms > 0 && finding.ms <= NEAR_ZERO_CEILING_MS,
    );
    expect(nearZero, `near-zero durations:\n${report(nearZero)}`).toEqual([]);
  });

  it('keeps manual motion policy aligned with the system reduced-motion contract', () => {
    expect(animationStyles).toContain(':root[data-motion-preference="reduced"]');
    expect(animationStyles).toContain(':root:not([data-motion-preference="standard"])');
    expect(animationStyles).toContain('animation-name: pop-in-reduced');
  });
});
