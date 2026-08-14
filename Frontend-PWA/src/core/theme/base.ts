// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import { generatePropertyRegistrations } from './tokens';

/**
 * CLASH MANAGER - Base Reset & Gestures
 * Ported to TypeScript for Technical Purity.
 */
export const staticTokens = `
:root {
  /* ── LAYOUT ── */
  --sys-layout-max-width: 720px;

  /* ── FONTS ── */
  --sys-font-family-body: "Inter", system-ui, sans-serif;
  --sys-font-family-mono: "JetBrains Mono", monospace;

  /* ── SHAPE CORNERS (ascending order) ── */
  --sys-shape-corner-extra-small:  4px;
  --sys-shape-corner-badge:        6px;
  --sys-shape-corner-small:        8px;
  --sys-shape-corner-stat:        10px;
  --sys-shape-corner-medium:      12px;
  --sys-shape-corner-input:       14px;
  --sys-shape-corner-large:       16px;
  --sys-shape-corner-m:           20px;
  --sys-shape-corner-l:           24px;
  --sys-shape-corner-extra-large: 28px;
  --sys-shape-corner-full:        9999px;

  /* ── SPACING SCALE (pixel-named, 4px atomic grid) ── */
  --sys-space-2:    2px;
  --sys-space-4:    4px;
  --sys-space-6:    6px;
  --sys-space-8:    8px;
  --sys-space-10:  10px;
  --sys-space-12:  12px;
  --sys-space-14:  14px;
  --sys-space-16:  16px;
  --sys-space-18:  18px;
  --sys-space-20:  20px;
  --sys-space-24:  24px;
  --sys-space-28:  28px;
  --sys-space-32:  32px;
  --sys-space-40:  40px;
  --sys-space-44:  44px;
  --sys-space-48:  48px;
  --sys-space-56:  56px;
  --sys-space-76:  76px;
  --sys-space-120: 120px;

  /* ── TYPE SCALE ── */
  --sys-typescale-label-xs:  8px;
  --sys-typescale-label-sm:  9px;
  --sys-typescale-label-md: 10px;
  --sys-typescale-meta:     11px;
  --sys-typescale-footer:   12px;
  --sys-typescale-body-sm:  13px;
  --sys-typescale-body-md:  14px;
  --sys-typescale-body-rg:  15px;
  --sys-typescale-player:   16px;
  --sys-typescale-title-sm: 18px;
  --sys-typescale-score:    19px;
  --sys-typescale-title-lg: 24px;

  /* ── MOTION DURATIONS ── */
  --sys-motion-duration-100: 0.1s;
  --sys-motion-duration-200: 0.2s;
  --sys-motion-duration-250: 0.25s;
  --sys-motion-duration-300: 0.3s;
  --sys-motion-duration-400: 0.4s;
  --sys-motion-duration-800: 0.8s;

  /* ── MOTION EASINGS ── */
  --sys-motion-spring:                 cubic-bezier(0.175, 0.885, 0.32, 1.15);
  --sys-motion-easing-standard:        cubic-bezier(0.4, 0, 0.2, 1);
  --sys-motion-easing-decelerate:      cubic-bezier(0.2, 0, 0, 1);
  --sys-motion-easing-spring-overshoot: cubic-bezier(0.34, 1.56, 0.64, 1);
  --sys-motion-easing-spring-nav:      cubic-bezier(0.2, 0, 0, 1.2);

  /* ── Z-INDEX SCALE (global layer stacking, ascending) ── */
  --sys-z-sticky:    50;
  --sys-z-header:   100;
  --sys-z-dropdown: 110;
  --sys-z-dock:     500;
  --sys-z-toast:   1000;
  --sys-z-ptr:     1001;
  --sys-z-overlay: 2000;
  --sys-z-strip:   3000;
  --sys-z-frame:   9999;
  --sys-z-tooltip: 10000;

  /* ── LETTER SPACING ── */
  --sys-tracking-tightest: -0.05em;
  --sys-tracking-tight:    -0.04em;
  --sys-tracking-snug:     -0.03em;
  --sys-tracking-normal:   -0.02em;
  --sys-tracking-neg-1:    -0.01em;
  --sys-tracking-none:      0em;
  --sys-tracking-wide:      0.05em;
  --sys-tracking-wider:     0.06em;
  --sys-tracking-widest:    0.1em;

  /* ── LINE HEIGHTS ── */
  --sys-leading-none:   1;
  --sys-leading-tight:  1.1;
  --sys-leading-normal: 1.5;
}

${generatePropertyRegistrations()}
`;

export const baseStyles = staticTokens + `
/* =========================================
   MINIMAL RESET
   ========================================= */
*, ::before, ::after {
  box-sizing: border-box;
  border-width: 0;
  border-style: solid;
  border-color: var(--sys-color-outline-variant, #e0e0e0);
}

html {
  line-height: 1.5;
  -webkit-text-size-adjust: 100%;
  tab-size: 4;
  font-family: system-ui, sans-serif;
  scrollbar-gutter: stable;
}

body {
  margin: 0;
  line-height: inherit;
  color: var(--sys-color-on-surface);
  background: var(--sys-color-background);
  min-height: 100dvh;
}

hr { height: 0; color: inherit; border-top-width: 1px; }

h1, h2, h3, h4, h5, h6 { font-size: inherit; font-weight: inherit; }

a { color: inherit; text-decoration: inherit; }

b, strong { font-weight: bolder; }

code, kbd, samp, pre {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 1em;
}

small { font-size: 80%; }

sub, sup {
  font-size: 75%;
  line-height: 0;
  position: relative;
  vertical-align: baseline;
}

sub { bottom: -0.25em; }
sup { top: -0.5em; }

table { text-indent: 0; border-color: inherit; border-collapse: collapse; }

button, input, optgroup, select, textarea {
  font-family: inherit;
  font-size: 100%;
  line-height: inherit;
  color: inherit;
  margin: 0;
  padding: 0;
}

button, select { text-transform: none; }

button, [type='button'], [type='reset'], [type='submit'] {
  -webkit-appearance: button;
  background-color: transparent;
  background-image: none;
}

:-moz-focusring { outline: auto; }
:-moz-ui-invalid { box-shadow: none; }
progress { vertical-align: baseline; }

::-webkit-inner-spin-button, ::-webkit-outer-spin-button { height: auto; }

[type='search'] { -webkit-appearance: textfield; outline-offset: -2px; }

::-webkit-search-decoration { -webkit-appearance: none; }

::-webkit-file-upload-button { -webkit-appearance: button; font: inherit; }

summary { display: list-item; }

blockquote, dl, dd, h1, h2, h3, h4, h5, h6, hr, figure, p, pre { margin: 0; }

fieldset { margin: 0; padding: 0; }

legend { padding: 0; }

ol, ul, menu { list-style: none; margin: 0; padding: 0; }

img, svg, video, canvas, audio, iframe, embed, object {
  display: block;
  vertical-align: middle;
}

img, video { max-width: 100%; height: auto; }

/* =========================================
   LOCAL FONTS
   ========================================= */
@font-face {
  font-family: "Inter";
  font-style: normal;
  font-weight: 100 900;
  font-display: optional;
  src: url("fonts/Inter-Variable.woff2") format("woff2");
}

@font-face {
  font-family: "JetBrains Mono";
  font-style: normal;
  font-weight: 700;
  font-display: optional;
  src: url("fonts/JetBrainsMono-Bold.woff2") format("woff2");
}

/* =========================================
   NATIVE APP GESTURES
   ========================================= */
body {
  overscroll-behavior-y: auto;
  overscroll-behavior-x: none;
  touch-action: auto;
}

* {
  -webkit-user-select: none;
  -moz-user-select: none;
  user-select: none;
}

input, textarea, [contenteditable], .selectable {
  -webkit-user-select: text;
  -moz-user-select: text;
  user-select: text;
}

* { -webkit-touch-callout: none; }

button, a, [role="button"], [role="link"], input, select, textarea {
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}

.view-container, .scrollable-area, .list-container {
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-y: auto;
}

/* Enforce containment option for custom overlays */
.prevent-overscroll {
  overscroll-behavior-y: contain;
}
`;
