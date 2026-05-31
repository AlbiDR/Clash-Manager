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
} from "@shared";
import {
  idb,
  useApiState,
  useAppSettings,
  useClashDataStore,
  useStoragePersistence,
  useWakeLock,
} from "@core";

import { createApp, watch } from "vue";
import { createPinia } from "pinia";
import { baseStyles } from "@core/theme/base";
import { animationStyles } from "@core/theme/animations";
import { skeletonStyles } from "@core/theme/skeletons";
import { componentStyles } from "@core/theme/components";
import App from "./App.vue";

import router from "./router";

// REMOVED: Synchronous import of autoAnimatePlugin
// import { autoAnimatePlugin } from '@formkit/auto-animate/vue'
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
    app.use(router);
    app.component("Icon", Icon);

    // PERFORMANCE: Register directives before mount
    app.directive("tooltip", vTooltip);
    app.directive("tactile", vTactile);

    // PRE-MOUNT: Register critical plugins
    try {
      const { autoAnimatePlugin } = await import("@formkit/auto-animate/vue");
      app.use(autoAnimatePlugin);
    } catch (e) {
      console.warn("Failed to load animations", e);
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

    // 4. Initialize Systems (Immediate)
    const clashDataStore = useClashDataStore();
    const apiState = useApiState();
    const wakeLock = useWakeLock();
    const storagePersistence = useStoragePersistence();

    // INSTANT BOOT & LIVE DATA FIRST: Load local cache and trigger remote hydration in parallel
    // removing ping-latency delays on boot.
    clashDataStore.loadLocal();
    clashDataStore.refreshFromSupabase();
    
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
    // Trigger immediate data revalidation when the app regains focus.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        console.debug("[App] Visibility changed to visible: Triggering live data revalidation");
        clashDataStore.refreshFromSupabase();
      }
    });

    // Defer only truly heavy background tasks
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
      if (
        "serviceWorker" in navigator &&
        "periodicSync" in (navigator.serviceWorker as unknown as { periodicSync: unknown })
      ) {
        try {
          const registration = await navigator.serviceWorker.ready;
          const periodicSync = (registration as unknown as { periodicSync?: { register: (tag: string, options: { minInterval: number }) => Promise<void> } }).periodicSync;

          if (periodicSync) {
            const status = await (navigator.permissions as unknown as { query: (options: { name: string }) => Promise<{ state: string }> }).query({
              name: "periodic-background-sync",
            });

            if (status.state === "granted") {
              await periodicSync.register(
                "update-recruit-badge",
                {
                  minInterval: 12 * 60 * 60 * 1000, // 12 hours
                },
              );
            }
          }
        } catch (e) {
          console.warn("Periodic Sync registration failed", e);
        }
      }
    }, 1000);
  } catch (error) {
    showFatalError(error);
  }
}

bootstrap();
