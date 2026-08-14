// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import { describe, it, expect } from 'vitest';
import { generateCssVariables, lightTokens, darkTokens, type ThemeTokens } from '../tokens';

// WCAG relative luminance / contrast, ported for a pure-JS regression guard.
// The actual .score-tint CSS mixes in OKLCH, not sRGB, so this is a linear
// sRGB approximation - not pixel-exact - but it's enough to catch gross
// regressions (e.g. a typo'd switch value) without a full OKLCH port.
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const [lr, lg, lb] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}
function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const [l1, l2] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
function mixRgb(low: [number, number, number], high: [number, number, number], pct: number) {
  return low.map((c, i) => c + (high[i] - c) * (pct / 100)) as [number, number, number];
}

describe('Score-tint text switch (WCAG regression guard)', () => {
  it.each([
    ['light', lightTokens],
    ['dark', darkTokens],
  ] as [string, ThemeTokens][])('%s: the stored switch point is near-optimal and >= 3:1 (WCAG AA large text)', (_label, tokens) => {
    const surface = hexToRgb(tokens.color.surfaceContainerHighest);
    const primary = hexToRgb(tokens.color.primary);
    const onSurface = hexToRgb(tokens.color.onSurface);
    const onPrimary = hexToRgb(tokens.color.onPrimary);
    const s = Number(tokens.color.scoreTextSwitch);

    const bgAtSwitch = mixRgb(surface, primary, s);
    const cSurf = contrastRatio(bgAtSwitch, onSurface);
    const cPrim = contrastRatio(bgAtSwitch, onPrimary);

    // Neither ink should be badly wrong at the switch point itself - this
    // is the single worst point on the whole ramp by construction.
    expect(Math.min(cSurf, cPrim)).toBeGreaterThanOrEqual(3);

    // A few points away from the switch, whichever ink is currently in use
    // should already be comfortably better than right at the crossover -
    // confirms the stored value is actually near the true minimum, not off
    // in a flat region.
    const before = contrastRatio(mixRgb(surface, primary, Math.max(0, s - 5)), onSurface);
    const after = contrastRatio(mixRgb(surface, primary, Math.min(100, s + 5)), onPrimary);
    expect(before).toBeGreaterThan(Math.min(cSurf, cPrim));
    expect(after).toBeGreaterThan(Math.min(cSurf, cPrim));
  });
});

describe('Tokens Module', () => {
  describe('generateCssVariables', () => {
    it('should transform camelCase color keys to kebab-case with --sys-color- prefix', () => {
      const vars = generateCssVariables(lightTokens);

      // Basic color
      expect(vars['--sys-color-primary']).toBe(lightTokens.color.primary);

      // CamelCase color
      expect(vars['--sys-color-on-primary-container']).toBe(lightTokens.color.onPrimaryContainer);

      // Another camelCase color
      expect(vars['--sys-color-surface-container-highest']).toBe(lightTokens.color.surfaceContainerHighest);
    });

    it('should correctly map elevation properties', () => {
      const vars = generateCssVariables(lightTokens);
      expect(vars['--sys-elevation-2']).toBe(lightTokens.elevation.level2);
      expect(vars['--sys-elevation-3']).toBe(lightTokens.elevation.level3);
    });

    it('should correctly map skeleton properties with --sh- prefix', () => {
      const vars = generateCssVariables(lightTokens);
      expect(vars['--sh-bg']).toBe(lightTokens.skeleton.bg);
      expect(vars['--sh-surf']).toBe(lightTokens.skeleton.surf);
      expect(vars['--sh-text']).toBe(lightTokens.skeleton.text);
      expect(vars['--sh-sk']).toBe(lightTokens.skeleton.sk);
      expect(vars['--sh-sk-secondary']).toBe(lightTokens.skeleton.skSecondary);
    });

    it('should correctly map glass special properties', () => {
      const vars = generateCssVariables(lightTokens);
      expect(vars['--sys-surface-glass']).toBe(lightTokens.color.glass);
      expect(vars['--sys-surface-glass-border']).toBe(lightTokens.color.glassBorder);
      expect(vars['--sys-surface-glass-blur']).toBe(lightTokens.color.glassBlur);
    });


    it('should produce different values for light and dark tokens', () => {
      const lightVars = generateCssVariables(lightTokens);
      const darkVars = generateCssVariables(darkTokens);

      expect(lightVars['--sys-color-primary']).not.toBe(darkVars['--sys-color-primary']);
      expect(lightVars['--sys-color-background']).not.toBe(darkVars['--sys-color-background']);
      expect(lightVars['--sh-bg']).not.toBe(darkVars['--sh-bg']);
    });

    it('should handle partial or malformed tokens without crashing', () => {
      // Cast to any to simulate malformed/partial data
      const partialTokens = {
        color: {
          primary: '#0061a4',
          // Missing other fields
        },
        elevation: {
          level2: 'shadow',
          // Missing level3
        },
        skeleton: {
          bg: '#ffffff',
          // Missing others
        }
      } as any;

      const vars = generateCssVariables(partialTokens);

      expect(vars['--sys-color-primary']).toBe('#0061a4');
      expect(vars['--sys-elevation-2']).toBe('shadow');
      expect(vars['--sh-bg']).toBe('#ffffff');

      // Undefined properties in the input result in undefined values in the output record
      expect(vars['--sys-elevation-3']).toBeUndefined();
      expect(vars['--sh-surf']).toBeUndefined();
      expect(vars['--sys-surface-glass']).toBeUndefined();
    });
  });
});
