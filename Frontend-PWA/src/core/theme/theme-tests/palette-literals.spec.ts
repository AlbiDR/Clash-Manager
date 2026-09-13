// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
/**
 * CLASH MANAGER - Palette Literal Firewall
 * ----------------------------------------------------------------------------
 * Fails the build on a colour written as a hex literal in component CSS.
 *
 * @remarks
 * A hex literal cannot respond to a theme, and this app ships a real light
 * theme and a real dark one. An audit on 2026-09-14 found 29 distinct hexes
 * across 60 uses, every one of them painting the same colour on a near-white
 * ground and a near-black one. Four of those components had noticed the
 * problem and solved it privately, writing a `:root.dark` override beside the
 * literal - MomentumPill, TrajectoryItem's `.eff-val`, App.vue's showcase
 * frame, and NetworkSettings, which had the same colours and no override at
 * all. That is the failure mode worth naming: not that a value was wrong, but
 * that four components each built a second theming system rather than reach
 * for the first.
 *
 * What the audit found underneath was vocabulary, not sloppiness. Two
 * components independently coloured the same three voyage states, two more
 * shared five rarity colours, two more shared a gold. Those are palettes the
 * design system was missing, and they are tokens now.
 *
 * [DECISION LOG] `var(--token, #fallback)` is allowed. A fallback is a
 * statement about what happens when the token is absent, which is a different
 * claim from painting a literal, and forbidding it would push authors toward
 * the less defensive form. `tokens.ts` is exempt because it is where the
 * palette is defined; a rule that forbade literals there would forbid the
 * palette itself.
 *
 * [THREAT:] An empty corpus passes any check that only looks for violations,
 * so the file and body counts are asserted first.
 * ============================================================================
 */
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { walkSource, styleBodies, stripComments } from './style-corpus';

const SRC_DIR = join(__dirname, '..', '..', '..');

/** Where the palette is declared, and therefore the one place literals belong. */
const PALETTE_SOURCE = join('core', 'theme', 'tokens.ts');

const HEX = /#[0-9a-fA-F]{3,8}\b/g;

/** A literal serving as the fallback arm of a custom property reference. */
const FALLBACK = /var\(\s*--[\w-]+\s*,[^)]*$/;

interface Finding {
  location: string;
  literal: string;
  text: string;
}

const files = walkSource(SRC_DIR).filter((file) => !file.endsWith(PALETTE_SOURCE));
const findings: Finding[] = [];
let inspectedBodies = 0;

for (const file of files) {
  for (const { css, startLine } of styleBodies(file)) {
    inspectedBodies += 1;
    stripComments(css)
      .split('\n')
      .forEach((text, index) => {
        for (const match of text.matchAll(HEX)) {
          // Anything before this literal on the line decides whether it is a
          // fallback; an unclosed var( to its left means it is.
          if (FALLBACK.test(text.slice(0, match.index))) continue;
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
  rows.map((row) => `  ${row.location}  ${row.literal}  in  ${row.text.slice(0, 64)}`).join('\n');

describe('palette literals', () => {
  it('inspects a non-empty corpus', () => {
    expect(files.length).toBeGreaterThan(50);
    expect(inspectedBodies).toBeGreaterThan(50);
  });

  it('paints no colour that the theme cannot reach', () => {
    expect(findings, `hex literals in component CSS:\n${report(findings)}`).toEqual([]);
  });
});
