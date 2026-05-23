// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import { createRouter, createWebHashHistory } from "vue-router";


const SCROLL_KEY = "cm_scroll_positions";

// Persistent scroll restoration logic
function saveScrollPosition(path: string, y: number) {
  try {
    const store = JSON.parse(sessionStorage.getItem(SCROLL_KEY) || "{}");
    store[path] = y;
    sessionStorage.setItem(SCROLL_KEY, JSON.stringify(store));
  } catch (e) {
    /* ignore */
  }
}

function getSavedScroll(path: string): number {
  try {
    const store = JSON.parse(sessionStorage.getItem(SCROLL_KEY) || "{}");
    return store[path] || 0;
  } catch (e) {
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

router.beforeResolve(async (to, from) => {
  if (isInitialNavigation) {
    isInitialNavigation = false;
    return;
  }
  
  if (to.path === from.path) return;
  if (!document.startViewTransition) return;
  if (document.visibilityState !== "visible") return;

  try {
    return await new Promise((resolve) => {
      let resolved = false;
      const transition = document.startViewTransition(() => {
        // Resolve the navigation, which triggers the DOM update
        resolve(true);
        resolved = true;
        // Wait for DOM to actually update before finishing the transition screenshot
        return new Promise((r) => setTimeout(r, 50));
      });
      
      // Fallback in case transition fails to start or callback isn't called
      setTimeout(() => {
        if (!resolved) resolve(true);
      }, 500);
    });
  } catch (e) {
    console.warn("View transition failed:", e);
    return true;
  }
});

// Save scroll before leaving route
router.beforeEach((_to, from) => {
  saveScrollPosition(from.path, window.scrollY);
});

router.afterEach((to) => {
  const baseTitle = "Clash Manager: Clan Manager for Clash Royale";
  document.title = to.meta.title
    ? `${to.meta.title} | ${baseTitle}`
    : baseTitle;
});

// RESILIENCE: Handle chunk loading errors during navigation
router.onError((error, to) => {
  const errString = String(error).toLowerCase();
  if (
    errString.includes("failed to fetch dynamically imported module") ||
    errString.includes("importing a module script failed") ||
    errString.includes("chunkloaderror")
  ) {
    console.warn("Chunk load error detected, reloading page...", error);
    window.location.href = to.fullPath || "/";
  } else {
    console.error("Unhandled router error:", error);
  }
});

export default router;
