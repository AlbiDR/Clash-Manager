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
    onPrimary: string;
    primaryContainer: string;
    onPrimaryContainer: string;

    secondary: string;
    onSecondary: string;
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

    warning: string;
    onWarning: string;
    warningContainer: string;
    onWarningContainer: string;

    // Score-tint text switch point (see .score-tint in components.ts): the
    // score-raw % (0-100) at which score-pod/badge text should flip from
    // onSurface to onPrimary. A linear crossfade between the two inks is
    // WRONG here - it produces a mid-range gray with ~1.1:1 contrast against
    // the equally-mid-lightness background at that point. This value is the
    // score % where contrast(bg, onSurface) == contrast(bg, onPrimary), i.e.
    // the one point a hard switch is allowed to be at its worst. Derived via
    // WCAG relative-luminance search over the actual primary/
    // surfaceContainerHighest/onPrimary/onSurface values below - recompute
    // (see tokens.spec.ts) if any of those four change.
    scoreTextSwitch: string;

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
  // Loading-skeleton placeholder tones (--sk-*). Deliberately independent
  // from `color` - e.g. light.surf ('#f3edf7') is not the same shade as
  // light.color.surface ('#fdfcff') by design. Do not collapse these into
  // `color` aliases; any incidental equality with a `color` value elsewhere
  // is coincidence, not a contract.
  skeleton: {
    bg: string;
    surf: string;
    text: string;
    fill: string;
    fillSecondary: string;
  };
}

/**
 * Authoritative light theme substrate.
 */
export const lightTokens: ThemeTokens = {
  color: {
    primary: '#0061a4',
    onPrimary: '#ffffff',
    primaryContainer: '#d1e4ff',
    onPrimaryContainer: '#001d36',

    secondary: '#535f70',
    onSecondary: '#ffffff',
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

    warning: '#7D5700',
    onWarning: '#ffffff',
    warningContainer: '#FFDEA8',
    onWarningContainer: '#261A00',

    scoreTextSwitch: '75.5',

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
    fill: '#e6e0e9',
    fillSecondary: '#dcdada',
  },
};

/**
 * Authoritative dark theme substrate.
 */
export const darkTokens: ThemeTokens = {
  color: {
    primary: '#a8c7fa',
    onPrimary: '#00315b',
    primaryContainer: '#004781',
    onPrimaryContainer: '#d1e4ff',

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

    warning: '#FFC53D',
    onWarning: '#401A00',
    warningContainer: '#5A3600',
    onWarningContainer: '#FFDEA8',

    scoreTextSwitch: '53',

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
    fill: '#2f343e',
    fillSecondary: '#3b4858',
  },
};

/**
 * Derives a 'r, g, b' triplet string from a 6-digit hex color, so that
 * `rgba(var(--sys-color-x-rgb), alpha)` consumers never require a
 * hand-maintained decimal copy of the source hex sitting next to it.
 */
export function hexToRgbTriplet(hex: string): string {
  const n = parseInt(hex.replace('#', ''), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

// Color roles that need an `rgba()`-friendly '--sys-color-{role}-rgb' companion
// var, for translucent fills/borders/shadows built on top of a solid role.
// Add a role here (not a hand-typed literal) when a new one is needed.
const RGB_COMPANIONS = ['primary', 'onPrimaryContainer'] as const;

// Automated camelCase to kebab-case transformation to ensure alignment with
// standard CSS custom-property naming conventions.
function toKebabCase(key: string): string {
  return key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
}

function mapGroup(prefix: string, group: Record<string, string>): Record<string, string> {
  const vars: Record<string, string> = {};
  Object.entries(group).forEach(([key, value]) => {
    vars[`${prefix}${toKebabCase(key)}`] = value;
  });
  return vars;
}

// `color` keys that are not <color> values (a bare number, a filter
// function) and so cannot be registered as such via @property.
const NON_COLOR_KEYS = new Set(['scoreTextSwitch', 'glassBlur']);

/**
 * Emits one `@property` block per `--sys-color-*` token that is genuinely a
 * CSS `<color>`, registering it with the engine so an invalid value is
 * rejected by the cascade instead of silently corrupting a downstream
 * computation, and so theme-toggle color transitions become animatable
 * (an unregistered custom property cannot be interpolated). Theme-agnostic:
 * emitted once, using `lightTokens` purely as the initial-value source -
 * the actual per-theme value is still supplied by `generateCssVariables`.
 */
export function generatePropertyRegistrations(): string {
  return Object.entries(lightTokens.color)
    .filter(([key]) => !NON_COLOR_KEYS.has(key))
    .map(
      ([key, value]) => `@property --sys-color-${toKebabCase(key)} {
  syntax: '<color>';
  inherits: true;
  initial-value: ${value};
}`
    )
    .join('\n');
}

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
  const vars: Record<string, string> = {
    ...mapGroup('--sys-color-', tokens.color),
    ...mapGroup('--sk-', tokens.skeleton),
  };

  for (const role of RGB_COMPANIONS) {
    const hex = tokens.color[role];
    if (hex) vars[`--sys-color-${toKebabCase(role)}-rgb`] = hexToRgbTriplet(hex);
  }

  vars['--sys-elevation-2'] = tokens.elevation.level2;
  vars['--sys-elevation-3'] = tokens.elevation.level3;

  // Add glass special properties
  vars['--sys-surface-glass'] = tokens.color.glass;
  vars['--sys-surface-glass-border'] = tokens.color.glassBorder;
  vars['--sys-surface-glass-blur'] = tokens.color.glassBlur;

  return vars;
}
