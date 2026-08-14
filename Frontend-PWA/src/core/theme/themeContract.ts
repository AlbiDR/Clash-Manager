// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
/**
 * CLASH MANAGER - Theme Resolution Contract (TypeScript Source of Truth)
 *
 * @remarks
 * The pre-hydration boot script in HtmlEntry.ts must run before any module
 * graph loads, so it can never `import` from this file - its logic is
 * necessarily re-expressed as a raw inline string (BOOT_THEME_SCRIPT below).
 * That duplication is structural and accepted; what's shared instead is the
 * storage key and the script *text* itself, with a parity test
 * (theme-ssot.spec.ts) asserting the two decision procedures agree for every
 * (stored preference) x (OS preference) combination.
 */

export type Theme = 'light' | 'dark' | 'auto';

export const THEME_STORAGE_KEY = 'cm_theme_preference';

/**
 * Resolves whether dark mode should be active given a stored preference and
 * the OS-level `prefers-color-scheme: dark` match state. Mirrors
 * BOOT_THEME_SCRIPT's inline JS exactly - see the parity test.
 */
export function resolveIsDark(pref: string | null, prefersDark: boolean): boolean {
  return pref === 'dark' || ((!pref || pref === 'auto') && prefersDark);
}

/**
 * Raw inline JS, executed synchronously in <head> before Vue (or any module)
 * loads, to add/remove the `dark` class on <html> ahead of first paint and
 * avoid a flash of incorrectly-themed content. Must stay self-contained -
 * no imports, no dependency on the module graph.
 */
export const BOOT_THEME_SCRIPT = `
    (function() {
      var pref = localStorage.getItem("${THEME_STORAGE_KEY}");
      var isDark = pref === "dark" || ((!pref || pref === "auto") && window.matchMedia("(prefers-color-scheme: dark)").matches);
      if (isDark) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    })();
  `;
