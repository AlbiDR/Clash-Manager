// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
/**
 * WCAG relative luminance / contrast, for pure-JS regression guards over the
 * hand-authored palette in tokens.ts. This is a linear sRGB approximation -
 * some of the actual CSS this backs (.score-tint) mixes in OKLCH, not sRGB -
 * so it's not pixel-exact, but it's enough to catch gross regressions (a
 * typo'd hex, a contrast-breaking retune) without a full OKLCH port.
 */
export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function relativeLuminance([r, g, b]: [number, number, number]): number {
  const [lr, lg, lb] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

export function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const [l1, l2] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

export function mixRgb(
  low: [number, number, number],
  high: [number, number, number],
  pct: number
): [number, number, number] {
  return low.map((c, i) => c + (high[i] - c) * (pct / 100)) as [number, number, number];
}
