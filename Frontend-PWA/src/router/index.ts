import { createRouter, createWebHashHistory } from "vue-router";
import LeaderboardView from "../views/LeaderboardView.vue";

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
      redirect: "/leaderboard",
    },
    {
      path: "/leaderboard",
      name: "leaderboard",
      component: LeaderboardView, // Eager load for better LCP
      meta: { title: "Roster" },
    },
    {
      path: "/recruiter",
      name: "recruiter",
      component: () => import("../views/RecruiterView.vue"),
      meta: { title: "Headhunter" },
    },
    {
      path: "/quartermaster",
      name: "quartermaster",
      component: () => import("../views/QuartermasterView.vue"),
      meta: { title: "Quartermaster" },
    },
    {
      path: "/settings",
      name: "settings",
      component: () => import("../views/SettingsView.vue"),
      meta: { title: "Settings" },
    },
  ],
});

// ⚡ FIX: View Transitions Support with Safety Timeout
router.beforeResolve(async (_to, _from) => {
  if (!document.startViewTransition) return;
  if (document.visibilityState !== "visible") return;

  try {
    return await Promise.race<boolean | void>([
      new Promise((resolve) => {
        document.startViewTransition(async () => {
          resolve(true);
        });
      }),
      // Safety timeout: 500ms
      new Promise((resolve) => setTimeout(() => resolve(true), 500)),
    ]);
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

export default router;
