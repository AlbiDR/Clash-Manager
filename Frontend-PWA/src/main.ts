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
        <small style="margin-top: 40px; color: #555;">Version: ${import.meta.env.VITE_APP_VERSION || 'Unknown'}</small>
      </div>`;
  }
}

// ... global error handlers ...

async function bootstrap() {
  try {
    // Fix 11: Config Validation
    const gasUrl = import.meta.env.VITE_GAS_URL;
    if (!gasUrl && !localStorage.getItem("cm_gas_url")) {
       throw new Error("Missing Configuration: VITE_GAS_URL is not defined in environment variables.");
    }

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
