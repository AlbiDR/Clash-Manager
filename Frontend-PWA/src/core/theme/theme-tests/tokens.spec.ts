// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import { describe, it, expect } from 'vitest';
import { generateCssVariables, lightTokens, darkTokens } from '../tokens';

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
