// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import { ref } from "vue";
import { darkTokens, generateCssVariables, lightTokens } from "../../core/theme/tokens";
import { THEME_STORAGE_KEY, resolveIsDark, type Theme } from "../../core/theme/themeContract";

export type { Theme };

const STORAGE_KEY = THEME_STORAGE_KEY;

// EPHEMERAL: intentionally resets on cold start
const theme = ref<Theme>("auto");
// EPHEMERAL: intentionally resets on cold start
const isInitialized = ref(false);

/**
 * @remarks
 * The Theme Management domain (Layer 2) orchestrates system-aware visual states
 * and persistent user preferences. It acts as the primary hardware broker for
 * display-related browser APIs, ensuring 100/100 Lighthouse performance by
 * minimizing layout shifts (CLS) and hydration mismatches.
 *
 * **Reactive State:**
 * - `theme`: The current theme mode ('light', 'dark', or 'auto').
 * - `isInitialized`: Boolean indicating if the theme engine has completed its initial boot sequence.
 *
 * **Side Effects:**
 * - **DOM**: Mutates `document.documentElement` classes ('dark') and style properties (CSS Variables).
 * - **Persistence**: Writes user theme preference to `LocalStorage` (`cm_theme_preference`).
 * - **Meta Tags**: Dynamically manages the `theme-color` meta tag to match the active visual state.
 */
export function useTheme() {
  const mediaQuery =
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-color-scheme: dark)")
      : null;

  function applyTheme() {
    if (typeof document === "undefined" || !mediaQuery) return;

    const root = document.documentElement;
    const isDark = resolveIsDark(theme.value, mediaQuery.matches);
    const targetTokens = isDark ? darkTokens : lightTokens;
    const variables = generateCssVariables(targetTokens);
    
    // Inject tokens as style properties on root
    Object.entries(variables).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });

    if (isDark) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

    // 3. Update theme-color meta tags (NUCLEAR OPTION: Single Source of Truth)
    // Remove all existing theme-color tags to prevent browser confusion or OS overrides.
    const existingTags = document.querySelectorAll('meta[name="theme-color"]');
    existingTags.forEach((tag) => tag.remove());

    // Create a fresh, authoritative meta tag
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.content = targetTokens.color.background;
    document.head.appendChild(meta);
  }

  /**
   * Updates the global theme preference and triggers visual reconciliation.
   *
   * @param newTheme - The target theme mode.
   */
  function setTheme(newTheme: Theme) {
    theme.value = newTheme;
    localStorage.setItem(STORAGE_KEY, newTheme);
    applyTheme();
  }

  function init() {
    if (isInitialized.value || typeof window === "undefined") return;

    const cached = localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (cached && ["light", "dark", "auto"].includes(cached)) {
      theme.value = cached;
    }

    // [GUARD] Logic: Memory-safe singleton listener for system changes (Memory #10)
    if (mediaQuery) {
      mediaQuery.addEventListener("change", () => {
        if (theme.value === "auto") applyTheme();
      });
    }

    applyTheme();
    isInitialized.value = true;
  }

  /**
   * MANIFEST PURGE: Explicitly clears the manifest URI cache.
   *
   * @remarks
   * Deprecated no-op after removing the dynamic manifest swapper.
   */
  function clearManifestCache() {
    // Deprecated no-op
    console.log("[PWA] Manifest cache clear requested (no-op)");
  }

  return {
    theme,
    setTheme,
    init,
    clearManifestCache,
  };
}

