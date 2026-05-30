// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
/**
 * CLASH MANAGER - Neo-Material Design System (Consolidated v6.7)
 * DESIGN TOKENS (TypeScript Source of Truth)
 * Standards: technical purity, zero runtime bloat, static extraction potential.
 */

/**
 * Authoritative substrate for theme derivation in the \@core layer.
 * Defines the required color, elevation, and skeleton tokens for the design system.
 */
export interface ThemeTokens {
  color: {
    primary: string;
    primaryRgb: string;
    onPrimary: string;
    primaryContainer: string;
    onPrimaryContainer: string;
    onPrimaryContainerRgb?: string;

    secondary: string;
    onSecondary?: string;
    secondaryContainer: string;
    onSecondaryContainer: string;

    error: string;
    onError: string;
    errorContainer: string;
    onErrorContainer: string;

    success: string;
    onSuccess: string;
    successContainer: string;
    onSuccessContainer: string;

    background: string;
    surface: string;
    onSurface: string;

    surfaceContainer: string;
    surfaceContainerHigh: string;
    surfaceContainerHighest: string;

    inverseSurface: string;
    inverseOnSurface: string;
    inversePrimary: string;

    outline: string;
    outlineVariant: string;
    onSurfaceVariant: string;

    glass: string;
    glassBorder: string;
    glassBlur: string;
  };
  elevation: {
    level2: string;
    level3: string;
  };
  skeleton: {
    bg: string;
    surf: string;
    text: string;
    sk: string;
    skSecondary: string;
  };
}

/**
 * Authoritative light theme substrate.
 */
export const lightTokens: ThemeTokens = {
  color: {
    primary: '#0061a4',
    primaryRgb: '0, 97, 164',
    onPrimary: '#ffffff',
    primaryContainer: '#d1e4ff',
    onPrimaryContainer: '#001d36',
    onPrimaryContainerRgb: '0, 29, 54',

    secondary: '#535f70',
    secondaryContainer: '#d7e3f7',
    onSecondaryContainer: '#101c2b',

    error: '#ba1a1a',
    onError: '#ffffff',
    errorContainer: '#ffdad6',
    onErrorContainer: '#410002',

    success: '#145218',
    onSuccess: '#ffffff',
    successContainer: '#b9f6ca',
    onSuccessContainer: '#002105',

    background: '#fdfcff',
    surface: '#fdfcff',
    onSurface: '#1a1c1e',

    surfaceContainer: '#f3edf7',
    surfaceContainerHigh: '#ece6f0',
    surfaceContainerHighest: '#e6e0e9',

    inverseSurface: '#313033',
    inverseOnSurface: '#f4f2f7',
    inversePrimary: '#a8c7fa',

    outline: '#5f6368',
    outlineVariant: '#c4c7c5',
    onSurfaceVariant: '#44474f',

    glass: 'rgba(255, 255, 255, 0.9)',
    glassBorder: 'rgba(0, 0, 0, 0.08)',
    glassBlur: 'blur(24px) saturate(180%)',
  },
  elevation: {
    level2: '0 4px 12px -2px rgba(0, 0, 0, 0.08), 0 2px 6px -1px rgba(0, 0, 0, 0.04)',
    level3: '0 12px 32px -4px rgba(0, 0, 0, 0.1), 0 8px 16px -4px rgba(0, 0, 0, 0.08), 0 4px 8px -2px rgba(0, 0, 0, 0.04)',
  },
  skeleton: {
    bg: '#fdfcff',
    surf: '#f3edf7',
    text: '#1a1c1e',
    sk: '#e6e0e9',
    skSecondary: '#dcdada',
  },
};

/**
 * Authoritative dark theme substrate.
 */
export const darkTokens: ThemeTokens = {
  color: {
    primary: '#a8c7fa',
    primaryRgb: '168, 199, 250',
    onPrimary: '#00315b',
    primaryContainer: '#004781',
    onPrimaryContainer: '#d1e4ff',
    onPrimaryContainerRgb: '209, 228, 255',

    secondary: '#bbc7db',
    onSecondary: '#253140',
    secondaryContainer: '#3b4858',
    onSecondaryContainer: '#d7e3f7',

    error: '#ffb4ab',
    onError: '#690005',
    errorContainer: '#93000a',
    onErrorContainer: '#ffdad6',

    success: '#6dd58c',
    onSuccess: '#00390a',
    successContainer: '#005313',
    onSuccessContainer: '#b9f6ca',

    background: '#0b0e14',
    surface: '#0b0e14',
    onSurface: '#e1e2e8',

    surfaceContainer: '#1b1f27',
    surfaceContainerHigh: '#242932',
    surfaceContainerHighest: '#2f343e',

    inverseSurface: '#e6e1e5',
    inverseOnSurface: '#313033',
    inversePrimary: '#0061a4',

    outline: '#9aa0a6',
    outlineVariant: '#44474f',
    onSurfaceVariant: '#c4c7c5',

    glass: 'rgba(20, 24, 32, 0.94)',
    glassBorder: 'rgba(255, 255, 255, 0.12)',
    glassBlur: 'blur(24px) saturate(180%)',
  },
  elevation: {
    level2: '0 8px 16px -4px rgba(0, 0, 0, 0.5), 0 4px 8px -4px rgba(0, 0, 0, 0.4)',
    level3: '0 20px 40px -8px rgba(0, 0, 0, 0.7), 0 12px 24px -8px rgba(0, 0, 0, 0.6), 0 0 1px 0 rgba(255, 255, 255, 0.08)',
  },
  skeleton: {
    bg: '#0b0e14',
    surf: '#1b1f27',
    text: '#e1e2e8',
    sk: '#2f343e',
    skSecondary: '#3b4858',
  },
};

/**
 * Programmatically transforms a token set into a flat CSS Variable registry.
 *
 * @param tokens - The authoritative ThemeTokens substrate to transform.
 * @returns A flat record of CSS variable keys and their corresponding values.
 *
 * @remarks
 * Satisfies ADR Section I: Visual Purity and Section II: Structural Unitary Architecture.
 * Static tokens (shapes, fonts, motion) are managed in base.ts to minimize runtime
 * derivation overhead and ensure 100/100 performance scores.
 */
export function generateCssVariables(tokens: ThemeTokens): Record<string, string> {
  const vars: Record<string, string> = {};
  
  // [DECISION LOG] Automated camelCase to kebab-case transformation to ensure
  // alignment with standard --sys- prefixing and CSS naming conventions.
  Object.entries(tokens.color).forEach(([key, value]) => {
    const cssKey = `--sys-color-${key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}`;
    vars[cssKey] = value!;
  });
  
  vars['--sys-elevation-2'] = tokens.elevation.level2;
  vars['--sys-elevation-3'] = tokens.elevation.level3;
  
  vars['--sh-bg'] = tokens.skeleton.bg;
  vars['--sh-surf'] = tokens.skeleton.surf;
  vars['--sh-text'] = tokens.skeleton.text;
  vars['--sh-sk'] = tokens.skeleton.sk;
  vars['--sh-sk-secondary'] = tokens.skeleton.skSecondary;

  // Add glass special properties
  vars['--sys-surface-glass'] = tokens.color.glass;
  vars['--sys-surface-glass-border'] = tokens.color.glassBorder;
  vars['--sys-surface-glass-blur'] = tokens.color.glassBlur;

  return vars;
}
