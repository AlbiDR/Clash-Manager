// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
/**
 * CLASH MANAGER - Spacing and Radius Firewall
 * ----------------------------------------------------------------------------
 * Fails the build on a padding, margin, gap or corner radius written as a
 * pixel literal.
 *
 * @remarks
 * An audit on 2026-09-14 found 318 spacing literals and 57 radius literals, of
 * which only 20 and 14 respectively sat off the declared scales. That ratio is
 * the interesting part and it is why this check exists at all: almost every
 * literal already held a value the design system declares, so the drift was
 * not in what anyone chose, it was that nothing recorded the choice as a
 * choice. A value written out longhand is indistinguishable from a value
 * guessed, and the day the scale moves, none of them follow.
 *
 * [DECISION LOG] Only padding, margin, gap and border-radius are policed.
 * Positional offsets - top, left, inset, translate - are frequently
 * measurements of something else in the layout rather than steps on a rhythm,
 * and grading them against the spacing scale would produce confident nonsense.
 * `--sys-layout-dock-clearance` exists because exactly one of those, the list's
 * clearance above the dock, had been sitting in the spacing set by accident.
 *
 * Zero is exempt: `padding: 0` is an absence, not a step. Values inside
 * `env()` are exempt because they are the platform's measurements and not
 * ours.
 *
 * [THREAT:] An empty corpus passes any violation-only check, so the file and
 * body counts are asserted before the findings are.
 * ============================================================================
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  walkSource,
  styleBodies,
  stripComments,
  readScale,
  inlineStyles,
} from './style-corpus';

const SRC_DIR = join(__dirname, '..', '..', '..');
const BASE_TOKENS = readFileSync(join(__dirname, '..', 'base.ts'), 'utf8');

/** The definition site, which necessarily holds the literals. */
const TOKEN_SOURCE = join('core', 'theme', 'base.ts');

const SPACING_STEPS = new Set(readScale(BASE_TOKENS, 'space', 'px'));
const RADIUS_STEPS = new Set(readScale(BASE_TOKENS, 'shape-corner', 'px'));

const SPACING_PROPERTY = /(?:padding|margin|gap|row-gap|column-gap)[\w-]*\s*:\s*([^;]*)/g;
const RADIUS_PROPERTY = /border-radius\s*:\s*([^;]*)/g;
const PIXELS = /\b(\d+)px\b/g;

interface Finding {
  location: string;
  value: number;
  axis: 'spacing' | 'radius';
  text: string;
}

const files = walkSource(SRC_DIR).filter((file) => !file.endsWith(TOKEN_SOURCE));
const findings: Finding[] = [];
let inspectedBodies = 0;

/** `<style>` blocks and static `style=` attributes are one surface here. */
const surfaces = (file: string): { css: string; startLine: number }[] => [
  ...styleBodies(file),
  ...inlineStyles(file).map(({ css, line }) => ({ css, startLine: line })),
];

for (const file of files) {
  for (const { css, startLine } of surfaces(file)) {
    inspectedBodies += 1;
    stripComments(css)
      .split('\n')
      .forEach((text, index) => {
        const axes: [RegExp, Set<number>, Finding['axis']][] = [
          [SPACING_PROPERTY, SPACING_STEPS, 'spacing'],
          [RADIUS_PROPERTY, RADIUS_STEPS, 'radius'],
        ];
        for (const [property, steps, axis] of axes) {
          for (const declaration of text.matchAll(property)) {
            if (declaration[1].includes('env(')) continue;
            for (const literal of declaration[1].matchAll(PIXELS)) {
              const value = Number(literal[1]);
              if (value === 0) continue;
              findings.push({
                location: `${file.slice(SRC_DIR.length + 1)}:${startLine + index}`,
                value,
                axis,
                text: text.trim(),
              });
              // A literal is a finding whether or not it lands on a step; the
              // scales are read only so the message can say which it missed.
              void steps;
            }
          }
        }
      });
  }
}

const report = (rows: Finding[]): string =>
  rows
    .map((row) => {
      const steps = row.axis === 'spacing' ? SPACING_STEPS : RADIUS_STEPS;
      const onScale = steps.has(row.value) ? 'on-scale, needs the token' : 'OFF-SCALE';
      return `  ${row.location}  ${row.value}px (${onScale})  ${row.text.slice(0, 56)}`;
    })
    .join('\n');

describe('spacing and radius scales', () => {
  it('reads non-empty scales and a non-empty corpus', () => {
    expect(SPACING_STEPS.size).toBeGreaterThan(10);
    expect(RADIUS_STEPS.size).toBeGreaterThan(5);
    expect(files.length).toBeGreaterThan(50);
    expect(inspectedBodies).toBeGreaterThan(50);
  });

  it('spaces and rounds through tokens rather than literals', () => {
    expect(findings, `pixel literals in spacing or radius:\n${report(findings)}`).toEqual([]);
  });
});
