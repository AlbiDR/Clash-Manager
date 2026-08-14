// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import { createRouter, createWebHashHistory } from "vue-router";


const SCROLL_KEY = "cm_scroll_positions";

/**
 * Persistent Scroll Restoration Helper: saveScrollPosition
 *
 * @remarks
 * **Architectural Context:**
 * - **Satisfaction:** Satisfies ADR Section III: Visual Continuity.
 * - **Threat Mitigation:** Prevents unexpected layout scroll shifts when navigating
 *   back and forth between console tabs in mobile viewports.
 *
 * @param path - The router path being navigated away from.
 * @param y - The vertical scroll coordinate to be preserved.
 */
function saveScrollPosition(path: string, y: number) {
  try {
    const store = JSON.parse(sessionStorage.getItem(SCROLL_KEY) || "{}");
    store[path] = y;
    sessionStorage.setItem(SCROLL_KEY, JSON.stringify(store));
  } catch (scrollSaveError) {
    // [THREAT:] An exception during SessionStorage access (e.g. storage full or disabled)
    // must not block navigation or crash the application bootstrap lifecycle.
    // [DECISION LOG] Fail silently on scroll-save exceptions to preserve routing integrity.
  }
}

/**
 * Persistent Scroll Restoration Helper: getSavedScroll
 *
 * @remarks
 * **Architectural Context:**
 * - **Satisfaction:** Satisfies ADR Section III: Visual Continuity.
 *
 * @param path - The destination router path to retrieve the preserved scroll for.
 * @returns The saved vertical scroll offset, or 0 if none is stored or on read exception.
 */
function getSavedScroll(path: string): number {
  try {
    const store = JSON.parse(sessionStorage.getItem(SCROLL_KEY) || "{}");
    return store[path] || 0;
  } catch (scrollRestoreError) {
    // [THREAT:] SessionStorage security constraints or parse errors on corrupt payload.
    // [DECISION LOG] Return 0 fallback gracefully to ensure view renders at top of screen.
    return 0;
  }
}

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  scrollBehavior(to, _from, savedPosition) {
    // 1. Browser Back/Forward: Use browser's saved position
    if (savedPosition) return savedPosition;

    // 2. Tab Navigation: Restore from our persistent SessionStorage
    const y = getSavedScroll(to.path);
    if (y > 0) return { top: y, behavior: "instant" }; // 'instant' prevents jumpy animation on load

    // 3. Default: Top
    return { top: 0 };
  },
  routes: [
    {
      path: "/",
      redirect: "/roster",
    },
    {
      path: "/roster",
      name: "roster",
      component: () => import("@features/roster").then(m => m.RosterView),
      meta: { title: "Roster" },
    },
    {
      path: "/headhunter",
      name: "headhunter",
      component: () => import("@features/headhunter").then(m => m.HeadhunterView),
      meta: { title: "Headhunter" },
    },
    {
      path: "/laboratory",
      name: "laboratory",
      component: () => import("@features/laboratory").then(m => m.LaboratoryView),
      meta: { title: "Laboratory" },
    },
    {
      path: "/settings",
      name: "settings",
      component: () => import("@features/settings").then(m => m.SettingsView),
      meta: { title: "Settings" },
    },
  ],
});

// [PERF] FIX: View Transitions Support with Safety Timeout
let isInitialNavigation = true;

function shouldUseRouteViewTransition() {
  if (!document.startViewTransition) return false;
  if (document.visibilityState !== "visible") return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  if (window.matchMedia("(hover: none), (pointer: coarse)").matches) return false;
  return true;
}

/**
 * Navigation Guard: beforeResolve (View Transitions & UX orchestration)
 *
 * @remarks
 * **Architectural Context:**
 * - **Satisfaction:** Satisfies ADR Section III: Visual Continuity.
 * - **Threat Mitigation:** Prevents screen flashes and jumpy transition animations.
 *   Uses a safety fallback timeout to guarantee navigation completes even if the View
 *   Transitions API gets blocked or delayed.
 */
router.beforeResolve(async (to, from) => {
  if (isInitialNavigation) {
    isInitialNavigation = false;
    return;
  }
  
  if (to.path === from.path) return;
  if (!shouldUseRouteViewTransition()) return;

  try {
    return await new Promise((resolve) => {
      let resolved = false;
      document.startViewTransition(() => {
        // [DECISION LOG] Resolve navigation to trigger DOM update and view swap.
        resolve(true);
        resolved = true;
        // [PERF] Delay finishes the transition screenshot after DOM has settled.
        return new Promise((r) => setTimeout(r, 50));
      });
      
      // [THREAT:] Unresolved transition promise blocks route resolution and freezes the app.
      // [DECISION LOG] Enforce a strict 500ms safety timeout fallback to resolve route unconditionally.
      setTimeout(() => {
        if (!resolved) resolve(true);
      }, 500);
    });
  } catch (viewTransitionError) {
    console.warn("View transition failed:", viewTransitionError);
    return true;
  }
});

/**
 * Navigation Guard: beforeEach (Scroll Position Capturing)
 */
router.beforeEach((_to, from) => {
  saveScrollPosition(from.path, window.scrollY);
});

/**
 * Navigation Guard: afterEach (Title Synchronizer)
 */
router.afterEach((to) => {
  const baseTitle = "Clash Manager: Clan Manager for Clash Royale";
  document.title = to.meta.title
    ? `${to.meta.title} | ${baseTitle}`
    : baseTitle;
});

/**
 * Resilience Handler: onError (Dynamic Chunk Loading Recovery)
 *
 * @remarks
 * **Architectural Context:**
 * - **Satisfaction:** Satisfies ADR Section IV: Resilience and Graceful Degradation.
 * - **Threat Mitigation:** Prevents complete system lockouts if network drift or deployment overrides
 *   invalidate active hashed JS assets during client usage.
 */
router.onError((error, to) => {
  const errString = String(error).toLowerCase();
  if (
    errString.includes("failed to fetch dynamically imported module") ||
    errString.includes("importing a module script failed") ||
    errString.includes("chunkloaderror")
  ) {
    // [THREAT:] ChunkLoadError due to redeployed/purged files.
    // [DECISION LOG] Perform an absolute reload of the target path to fetch the fresh bundle manifest.
    // [THREAT:] This router uses hash history - `to.fullPath` (e.g. "/roster") has no
    // "#" prefix. Assigning it directly to `location.href` issues a real server request
    // for that bare path, which doesn't exist on a static host and 404s. Rebuild the URL
    // so the reload lands on the SPA entry point with the target route in the hash.
    console.warn("Chunk load error detected, reloading page...", error);
    const targetPath = to.fullPath || "/";
    window.location.href = `${window.location.pathname}${window.location.search}#${targetPath}`;
  } else {
    console.error("Unhandled router error:", error);
  }
});

export default router;
