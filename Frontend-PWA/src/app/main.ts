/**
* CLASH MANAGER PWA
 * Lead Full-Stack Architect & UI/UX Engineer Implementation
 */
import { useTheme } from "../shared/composables/useTheme";
import { vTactile } from "../shared/directives/vTactile";
import { vTooltip } from "../shared/directives/vTooltip";
import { idb } from "../core/services/StorageService";
import { useApiState } from "../core/api/useApiState";
import { useAppSettings } from "../core/services/useAppSettings";
import { useClashData } from "../core/services/useClashData";
import { useStoragePersistence } from "../core/services/useStoragePersistence";
import { useWakeLock } from "../core/services/useWakeLock";

import { createApp, watch } from "vue";
import "@/core/theme/base.css";
import "@/core/theme/tokens.css";
import "@/core/theme/animations.css";
import "@/core/theme/skeletons.css";
import "@/core/theme/components.css";
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
    const gasUrl = import.meta.env.VITE_GAS_URL;
    if (!gasUrl && !localStorage.getItem("cm_gas_url")) {
      throw new Error(
        "Missing Configuration: VITE_GAS_URL is not defined in environment variables.",
      );
    }

    // 1. Critical Config (Synchronous)
    const { modules, init: initModules } = useAppSettings();
    initModules();

    const theme = useTheme();
    theme.init();

    // 2. Create App
    const app = createApp(App);
    app.use(router);

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

    // 3. Mount App
    app.mount("#app");

    // 4. Initialize Systems (Immediate)
    const clashData = useClashData();
    const apiState = useApiState();
    const wakeLock = useWakeLock();
    const storagePersistence = useStoragePersistence();

    // INSTANT BOOT: Load local cache immediately for LCP
    await clashData.loadLocal();
    
    // CONCURRENCY FIX: Start API Handshake FIRST.
    // Do NOT start background sync (heavy data fetch) until handshake clears.
    // This prevents GAS 'Too Many Requests' errors on cold boot.
    apiState.init();

    // Watch for API health before triggering heavy data load
    const unwatch = watch(
      () => apiState.apiStatus.value,
      (status) => {
        if (status === "online") {
          // Server is awake and reachable, safe to sync data
          clashData.startBackgroundSync();
          unwatch(); // Run once per session
        } else if (status === "offline") {
          // If handshake fails completely, stop watching (Manual retry required)
          unwatch();
        }
      },
      { immediate: true }
    );

    // Defer only truly heavy background tasks
    setTimeout(async () => {
      wakeLock.init();
      
      // PERSISTENCE: Request durable storage
      storagePersistence.requestPersistence();

      // SYNC SETTINGS: Ensure SW has access to latest threshold
      if (modules.notificationThreshold) {
        await idb.set(
          "cm_notification_threshold",
          modules.notificationThreshold,
        );
      }

      // NATIVE: Register Periodic Sync for WebAPK
      if (
        "serviceWorker" in navigator &&
        "periodicSync" in (navigator as any).serviceWorker
      ) {
        try {
          const registration = await navigator.serviceWorker.ready;
          const status = await (navigator as any).permissions.query({
            name: "periodic-background-sync",
          });

          if (status.state === "granted") {
            await (registration as any).periodicSync.register(
              "update-recruit-badge",
              {
                minInterval: 12 * 60 * 60 * 1000, // 12 hours
              },
            );
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