// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * CLASH MANAGER PWA
 * Lead Full-Stack Architect & UI/UX Engineer Implementation
 */
import {
  useTheme,
  vTactile,
  vTooltip,
  Icon,
  useWakeLock,
} from "@shared";
import { useAppSettings } from "@core/services/useAppSettings";
import { registerVisibilityRefresh } from "@core";
import { FOREGROUND_POLL_INTERVAL } from "@core/config";

import { createApp, watch } from "vue";
import { createPinia } from "pinia";
import { DataLoaderPlugin } from "vue-router/experimental";
import { baseStyles } from "@core/theme/base";
import { animationStyles } from "@core/theme/animations";
import { skeletonStyles } from "@core/theme/skeletons";
import { componentStyles } from "@core/theme/components";
import App from "./App.vue";

import router from "./router";

// REMOVED: Synchronous import of autoAnimatePlugin
// import { autoAnimatePlugin } from '@formkit/auto-animate/vue'

/**
 * Renders a full-screen, system-critical error dialog if the application
 * fails to bootstrap before mounting the primary Vue instance.
 *
 * @remarks
 * **Design Decisions:**
 * - Directly mutates the raw `#app` innerHTML to bypass the Vue rendering engine,
 *   which is likely unmounted or crashed during a boot failure.
 * - Provides actionable recovery pathways, including a soft manual refresh or
 *   a complete, hard factory reset of client-side storage keys.
 *
 * @param error - The untrusted thrown exception or error object driving the failure.
 *
 * @sideeffects
 * - Mutates DOM state on the `#app` element.
 * - Calls `console.error` to print the untrusted boot error.
 */
function showFatalError(error: unknown) {
  console.error("FATAL ERROR:", error);
  // If the app hasn't mounted, we should probably show something on screen
  const appEl = document.getElementById("app");
  if (appEl && !appEl.innerHTML.includes("app-container")) {
    const message = error instanceof Error ? error.message : String(error);
    // Fix 10: Boot Error Visuals - More descriptive and actionable
    appEl.innerHTML = `
      <div style="
        display: flex; 
        flex-direction: column; 
        align-items: center; 
        justify-content: center; 
        height: 100vh; 
        background: #111; 
        color: #fff; 
        font-family: system-ui, sans-serif;
        text-align: center;
        padding: 20px;
      ">
        <h1 style="color: #ff5252; margin-bottom: 16px;">System Critical Error</h1>
        <p style="color: #aaa; margin-bottom: 32px; max-width: 400px; line-height: 1.5;">
          ${message || "Unknown error during startup"}
        </p>
        <div style="display: flex; gap: 12px;">
           <button 
             onclick="window.location.reload()" 
             style="padding: 12px 24px; background: #333; color: white; border: none; border-radius: 8px; cursor: pointer;">
             Retry
           </button>
           <button 
             onclick="localStorage.clear(); sessionStorage.clear(); window.location.reload()" 
             style="padding: 12px 24px; background: #ff5252; color: white; border: none; border-radius: 8px; cursor: pointer;">
             Factory Reset
           </button>
        </div>
        <small style="margin-top: 40px; color: #555;">Version: ${import.meta.env.VITE_APP_VERSION || "Unknown"}</small>
      </div>`;
  }
}

// ... global error handlers ...

/**
 * Primary Application Bootstrapper (Layer 4 Entry Point)
 * ----------------------------------------------------------------------------
 * Rationale: Sequentially initializes, configures, and mounts the Vue PWA client,
 * ensuring strict layering, lazy data layer hydration, and PWA capability binding.
 *
 * @remarks
 * **Bootstrap Sequence:**
 * 1. Validates environment configurations (Supabase URL).
 * 2. Initializes critical Layer 1 settings and theme configurations.
 * 3. Builds and configures the core Vue app, Pinia instance, and Experimental Router.
 * 4. Injects global aggregated CSS style tokens into the DOM head.
 * 5. Mounts the primary Vue shell layout.
 * 6. Defer-loads the heavy `@core` data layer to avoid LCP / blocking overhead.
 * 7. Performs background service worker update checks and registers WebAPK Periodic Sync.
 *
 * **Satisfaction:**
 * - **Satisfies ADR Section II:** Layer 4 App orchestration.
 * - **Satisfies ADR Section IV:** Resilient background synchronization.
 *
 * @throws Error - Aborts the bootstrap lifecycle if critical credentials (such as VITE_SUPABASE_URL) are missing.
 *
 * @sideeffects
 * - Initializes long-running background watchers, global listeners, and network timers.
 * - Spawns service worker background synchronizers and registers WebAPK sync targets.
 */
async function bootstrap() {
  try {
    // Fix 11: Config Validation
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    if (!supabaseUrl && !localStorage.getItem("cm_supabase_url")) {
      throw new Error(
        "Missing Configuration: VITE_SUPABASE_URL is not defined in environment variables.",
      );
    }

    // 1. Critical Config (Synchronous)
    const { modules, init: initModules } = useAppSettings();
    initModules();

    const theme = useTheme();
    theme.init();

    // 2. Create App
    const app = createApp(App);
    const pinia = createPinia();
    
    app.use(pinia);
    // [VR5] DataLoaderPlugin must be registered BEFORE router so it can
    // install its navigation guards ahead of any route-level guards.
    app.use(DataLoaderPlugin, { router });
    app.use(router);
    app.component("Icon", Icon);

    // PERFORMANCE: Register directives before mount
    app.directive("tooltip", vTooltip);
    app.directive("tactile", vTactile);

    // PRE-MOUNT: Register critical plugins
    try {
      const { autoAnimatePlugin } = await import("@formkit/auto-animate/vue");
      app.use(autoAnimatePlugin);
    } catch (autoAnimateLoadError) {
      console.warn("Failed to load animations", autoAnimateLoadError);
      // Fallback dummy to prevent errors
      app.directive("auto-animate", {});
    }

    // 3. Inject Global Styles (Atomic Purity)
    const styleTag = document.createElement("style");
    styleTag.id = "cm-global-styles";
    styleTag.textContent = baseStyles + animationStyles + skeletonStyles + componentStyles;
    document.head.appendChild(styleTag);

    // 4. Mount App
    app.mount("#app");

    // 4. Initialize Data Layer (deferred after first paint)
    // PERF: Dynamic import keeps the entire core data layer out of the render-blocking
    // critical path. The LCP element (dock) paints immediately after mount; data
    // hydration begins in the next macrotask once the browser is idle.
    import(
      /* webpackChunkName: "core-data" */
      "@core"
    ).catch((coreLoadError) => {
      console.error("[App] Core module failed to load - reloading:", coreLoadError);
      const retries = parseInt(sessionStorage.getItem('cm_boot_retry') || '0');
      if (retries < 2) {
        sessionStorage.setItem('cm_boot_retry', String(retries + 1));
        window.location.reload();
      }
      return null;
    }).then((mod) => {
      if (!mod) return;
      const { idb, useApiState, useClashDataStore, useStoragePersistence } = mod as Awaited<typeof import("@core")>;
      const clashDataStore = useClashDataStore();
      const apiState = useApiState();
      const wakeLock = useWakeLock();
      const storagePersistence = useStoragePersistence();

      // [VR5] Data hydration (loadLocal + startBackgroundSync) is now owned
      // by the route-level DataLoaderPlugin. The loader fires on the very
      // first navigation (/roster), ensuring the Pinia store is hydrated
      // before the view renders without any imperative boot call here.
      apiState.init();

      // PERFORMANCE: High-Speed SUPABASE Fetch fallback
      // Rationale: If the initial refresh failed or was delayed, ensure background sync proceeds once online.
      const unwatch = watch(
        () => apiState.apiStatus.value,
        (apiStatus) => {
          if (apiStatus === "online") {
            clashDataStore.startBackgroundSync();
            unwatch(); // Run once per session
          }
        },
        { immediate: true }
      );

      // LIVE DATA FIRST: App Focus Revalidation
      // Trigger data revalidation when the app regains focus, respecting the staleness threshold.
      registerVisibilityRefresh(() => {
        console.debug("[App] Visibility threshold reached: Triggering live data revalidation");
        // [FIX] checkApiStatus's own retry chain gives up permanently after 5
        // consecutive failures (see handleFailure in useApiState) and nothing else
        // in the app ever calls it again - a backend outage that resolves after the
        // hard-fail left the UI stuck reporting "No Network Connection" for the rest
        // of the session even once the backend was reachable again. Re-arm the
        // handshake here so a focus regain (the same signal already used to
        // revalidate data) also gives connectivity another chance.
        if (apiState.apiStatus.value === "offline") {
          apiState.checkApiStatus();
        }
        clashDataStore.refreshFromSupabase();
      });

      // LIVE DATA FIRST: Foreground Polling
      // Rationale: A tab left open and foregrounded continuously never hits the
      // visibility-change refresh (which only fires after being backgrounded for
      // VISIBILITY_REFRESH_THRESHOLD) or the router loader (only fires on navigation).
      // Without this, roster/member data (last-seen, active membership) would keep
      // showing the same in-memory snapshot indefinitely in a long-lived session.
      setInterval(() => {
        if (document.visibilityState === "visible") {
          // [FIX] Same permanent-offline lockout as the visibility-refresh handler
          // above, addressed for the case where the app is left open and
          // foregrounded continuously rather than backgrounded and resumed.
          if (apiState.apiStatus.value === "offline") {
            apiState.checkApiStatus();
          }
          clashDataStore.startBackgroundSync();
        }
      }, FOREGROUND_POLL_INTERVAL);

      // Defer truly heavy background tasks
      setTimeout(async () => {
        wakeLock.init();

        // PERSISTENCE: Request durable storage
        storagePersistence.requestPersistence();

        // SYNC SETTINGS: Ensure SW has access to latest configurations
        if (modules.notificationThreshold) {
          await idb.set(
            "cm_notification_threshold",
            modules.notificationThreshold,
          );
        }
        if (apiState.apiUrl.value) {
          await idb.set("cm_supabase_url", apiState.apiUrl.value);
          await idb.set("cm_supabase_key", import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);
        }

        // NATIVE: Register Periodic Sync for WebAPK
        if ("serviceWorker" in navigator) {
          try {
            const registration = await navigator.serviceWorker.ready;
            if ("periodicSync" in registration) {
              const status = await (navigator.permissions as unknown as { query: (options: { name: string }) => Promise<{ state: string }> }).query({
                name: "periodic-background-sync",
              });

              if (status.state === "granted") {
                const periodicSync = (registration as unknown as { periodicSync: { register: (tag: string, options: { minInterval: number }) => Promise<void> } }).periodicSync;
                const TWELVE_HOURS_IN_MS = 12 * 60 * 60 * 1000;
                await periodicSync.register(
                  "update-recruit-badge",
                  {
                    minInterval: TWELVE_HOURS_IN_MS,
                  },
                );
              }
            }
          } catch (periodicSyncRegistrationError) {
            console.warn("Periodic Sync registration failed", periodicSyncRegistrationError);
          }
        }
      }, 1000);
    });
  } catch (error) {
    showFatalError(error);
  }
}

bootstrap();
