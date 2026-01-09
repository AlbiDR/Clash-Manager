/**
 * 🚀 CLASH MANAGER PWA
 * Lead Full-Stack Architect & UI/UX Engineer Implementation
 */
import { createApp } from "vue";
import "./style.css";
import App from "./App.vue";
import router from "./router";
// REMOVED: Synchronous import of autoAnimatePlugin
// import { autoAnimatePlugin } from '@formkit/auto-animate/vue'
import { vTooltip } from "./directives/vTooltip";
import { vTactile } from "./directives/vTactile";
import { useModules } from "./composables/useModules";
import { useApiState } from "./composables/useApiState";
import { useClanData } from "./composables/useClanData";
import { useTheme } from "./composables/useTheme";
import { useWakeLock } from "./composables/useWakeLock";

function showFatalError(error: unknown) {
  console.error("FATAL ERROR:", error);
  // If the app hasn't mounted, we should probably show something on screen
  const appEl = document.getElementById("app");
  if (appEl && !appEl.innerHTML.includes("app-container")) {
    const message = error instanceof Error ? error.message : String(error);
    appEl.innerHTML = `<div style="padding:20px;color:red;text-align:center;">
            <h1>System Error</h1>
            <p>${message || "Unknown error during startup"}</p>
            <button onclick="localStorage.clear();window.location.reload()">Factory Reset</button>
        </div>`;
  }
}

// Enhanced Global Error Trap for Logcat Visibility
window.addEventListener("error", (event) => {
  console.error(
    `[GLOBAL ERROR] Msg: ${event.message} | File: ${event.filename} | Line: ${event.lineno}:${event.colno}`,
  );
  if (event.error && event.error.stack) {
    console.error(`[STACK]: ${event.error.stack}`);
  }
  showFatalError(event.error);
});

window.addEventListener("unhandledrejection", (event) => {
  console.error(`[UNHANDLED PROMISE]: ${event.reason}`);
  showFatalError(event.reason);
});

async function bootstrap() {
  try {
    // 1. Critical Config (Synchronous)
    const modules = useModules();
    modules.init();

    const theme = useTheme();
    theme.init();

    // 2. Create App
    const app = createApp(App);
    app.use(router);

    // ⚡ PERFORMANCE: Register directives before mount
    app.directive("tooltip", vTooltip);
    app.directive("tactile", vTactile);

    // ⚡ PRE-MOUNT: Register critical plugins
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

    // 4. Initialize Systems (Post-Mount)
    const clanData = useClanData();
    const apiState = useApiState();
    const wakeLock = useWakeLock();

    clanData.loadLocal();
    
    // Defer network and heavy systems
    setTimeout(async () => {
      apiState.init();
      clanData.startBackgroundSync();
      wakeLock.init();

      if ("serviceWorker" in navigator) {
        try {
          await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        } catch (err) {
          console.error("SW Register Failed", err);
        }
      }
    }, 400);

  } catch (error) {
    showFatalError(error);
  }
}


bootstrap();
