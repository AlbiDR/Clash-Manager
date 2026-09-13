// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
/**
 * CLASH MANAGER - Surface Overlay Firewall
 * ----------------------------------------------------------------------------
 * Fails the build on a hand-mixed black or white overlay.
 *
 * @remarks
 * An audit on 2026-09-14 found twenty-three distinct translucent blacks and
 * whites across the components: blacks at 0.02, 0.04, 0.05, 0.08, 0.1, 0.12,
 * 0.15, 0.2, 0.28, 0.3 and 0.4, whites from 0.03 to 0.16. Several pairs sat a
 * single hundredth apart, which is the tell - nobody can see 0.05 against 0.06,
 * so nobody chose between them. They were guesses at a handful of intentions,
 * and guesses reappear unless something objects.
 *
 * [DECISION LOG] Only pure black and pure white are policed. A translucent
 * BRAND colour is a different thing: `rgba(var(--sys-color-primary-rgb), 0.2)`
 * is already correct, and a literal tint of a palette colour belongs to the
 * palette work, not here. Widening this check to all of `rgba()` would flag
 * those too and bury the signal it exists to give.
 *
 * A fully transparent value is exempt. `rgba(0, 0, 0, 0)` is not an overlay
 * weight, it is the resting end of a transition - BaseCard opens on exactly
 * that so its shadow has somewhere to animate from.
 *
 * [THREAT:] An empty corpus would pass this by finding nothing, so the file
 * and style-body counts are asserted before any finding is.
 * ============================================================================
 */
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { walkSource, styleBodies } from './style-corpus';

const SRC_DIR = join(__dirname, '..', '..', '..');

/** The definition site itself, which necessarily holds the literals. */
const TOKEN_SOURCE = join('core', 'theme', 'base.ts');

/** Pure black or pure white with any alpha, however it is spaced. */
const NEUTRAL_OVERLAY = /rgba\(\s*(?:0\s*,\s*0\s*,\s*0|255\s*,\s*255\s*,\s*255)\s*,\s*([\d.]+)\s*\)/g;

interface Finding {
  location: string;
  literal: string;
  text: string;
}

const files = walkSource(SRC_DIR).filter((file) => !file.endsWith(TOKEN_SOURCE));
const findings: Finding[] = [];
let inspectedBodies = 0;

for (const file of files) {
  for (const { css, startLine } of styleBodies(file)) {
    inspectedBodies += 1;
    css.split('\n').forEach((text, index) => {
      for (const match of text.matchAll(NEUTRAL_OVERLAY)) {
        if (Number(match[1]) === 0) continue;
        findings.push({
          location: `${file.slice(SRC_DIR.length + 1)}:${startLine + index}`,
          literal: match[0],
          text: text.trim(),
        });
      }
    });
  }
}

const report = (rows: Finding[]): string =>
  rows.map((row) => `  ${row.location}  ${row.literal}  in  ${row.text.slice(0, 66)}`).join('\n');

describe('surface overlays', () => {
  it('inspects a non-empty corpus', () => {
    expect(files.length).toBeGreaterThan(50);
    expect(inspectedBodies).toBeGreaterThan(50);
  });

  it('mixes no black or white overlay by hand', () => {
    expect(findings, `hand-mixed overlays:\n${report(findings)}`).toEqual([]);
  });
});
