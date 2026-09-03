// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * @vitest-environment node
 *
 * No DOM in this file, so it skips jsdom entirely. Building a jsdom Window
 * costs ~410ms per test file and dominated the suite (80.6s of ~120s CPU,
 * against 8.1s of actual test execution). Adding anything here that touches
 * `document`, `window`, `localStorage` or mounts a component will fail loudly
 * and immediately - remove this docblock if that is intentional.
 */
import { describe, it, expect } from 'vitest';
import { generateCssVariables, lightTokens, darkTokens, type ThemeTokens } from '../tokens';
import { hexToRgb, contrastRatio, mixRgb } from './wcag';

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

    it('should correctly map skeleton properties with --sk- prefix', () => {
      const vars = generateCssVariables(lightTokens);
      expect(vars['--sk-bg']).toBe(lightTokens.skeleton.bg);
      expect(vars['--sk-surf']).toBe(lightTokens.skeleton.surf);
      expect(vars['--sk-text']).toBe(lightTokens.skeleton.text);
      expect(vars['--sk-fill']).toBe(lightTokens.skeleton.fill);
      expect(vars['--sk-fill-secondary']).toBe(lightTokens.skeleton.fillSecondary);
    });

    it('should derive rgb companion vars from hex, not a hand-typed literal', () => {
      const vars = generateCssVariables(lightTokens);
      expect(vars['--sys-color-primary-rgb']).toBe('0, 97, 164');
      expect(vars['--sys-color-on-primary-container-rgb']).toBe('0, 29, 54');

      const darkVars = generateCssVariables(darkTokens);
      expect(darkVars['--sys-color-primary-rgb']).toBe('168, 199, 250');
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
      expect(lightVars['--sk-bg']).not.toBe(darkVars['--sk-bg']);
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
      expect(vars['--sk-bg']).toBe('#ffffff');

      // Undefined properties in the input result in undefined values in the output record
      expect(vars['--sys-elevation-3']).toBeUndefined();
      expect(vars['--sk-surf']).toBeUndefined();
      expect(vars['--sys-surface-glass']).toBeUndefined();
    });
  });
});
