
import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import router from './router'
import { vTooltip } from './directives/vTooltip'
import { vTactile } from './directives/vTactile'
import { useModules } from './composables/useModules'
import { useApiState } from './composables/useApiState'
import { useClanData } from './composables/useClanData'
import { useTheme } from './composables/useTheme'

// 🚨 CRITICAL ERROR HANDLER
// This ensures that if the app crashes (White Screen), the error is shown to the user.
// We nuke the entire body to ensure Vue stops trying to patch a dying DOM.
function showFatalError(error: any) {
    // Prevent recursive error handling
    if ((window as any).__hasShownFatalError) return;
    (window as any).__hasShownFatalError = true;

    console.error('FATAL ERROR CAUGHT:', error);

    const msg = error?.message || String(error);
    const stack = error?.stack || 'No stack trace available.';

    // ♻️ AUTO-RECOVERY: Asset/Chunk Load Failures
    // This happens when a new version is deployed and the user's cached index.html
    // points to old hashed files (CSS/JS) that no longer exist on the server.
    if (
        msg.includes('Unable to preload CSS') || 
        msg.includes('Failed to fetch dynamically imported module') ||
        msg.includes('Importing a module script failed')
    ) {
        const key = 'cm_retry_timestamp';
        const lastRetry = parseInt(sessionStorage.getItem(key) || '0');
        const now = Date.now();

        // Retry only if we haven't done so in the last 15 seconds
        if (now - lastRetry > 15000) {
            sessionStorage.setItem(key, now.toString());
            console.warn('♻️ Stale assets detected. Reloading app to fetch new version...');
            window.location.reload();
            return;
        }
    }

    // Nuke everything. Stop all scripts/rendering.
    document.body.innerHTML = '';
    
    // Create error container
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
        position: fixed; inset: 0; z-index: 99999;
        padding: 2rem; color: #ffcccc; background: #1a0505; 
        font-family: monospace; overflow: auto;
        display: flex; flex-direction: column; gap: 1rem;
    `;

    errorDiv.innerHTML = `
        <h1 style="color: #ff4444; margin: 0; font-size: 24px;">Application Crash</h1>
        <p style="margin: 0; font-size: 16px; line-height: 1.5;">${msg}</p>
        <div style="background: rgba(0,0,0,0.3); padding: 1rem; border-left: 4px solid #ff4444; white-space: pre-wrap; font-size: 12px;">${stack}</div>
        <button id="reload-btn" style="
            padding: 12px 24px; background: #ff4444; color: white; border: none; 
            border-radius: 4px; font-weight: bold; cursor: pointer; width: fit-content;
            margin-top: 1rem;
        ">
            Reload App
        </button>
    `;

    document.body.appendChild(errorDiv);
    
    document.getElementById('reload-btn')?.addEventListener('click', () => {
        window.location.reload();
    });
}

window.addEventListener('error', (event) => showFatalError(event.error));
window.addEventListener('unhandledrejection', (event) => showFatalError(event.reason));

// --- Application Logic ---

async function bootstrap() {
    try {
        // 1. Initialize Global Stores (Logic before UI)
        const moduleState = useModules()
        moduleState.init()

        const apiState = useApiState()
        apiState.init()

        // Theme initialization must happen as early as possible
        const themeState = useTheme()
        themeState.init()

        const clanData = useClanData()
        // We do NOT await this, as it handles its own SWR (Stale-While-Revalidate)
        clanData.init()

        // 2. Mount App
        const app = createApp(App)

        app.use(router)
        app.directive('tooltip', vTooltip)
        app.directive('tactile', vTactile)

        // Attempt mount
        app.mount('#app')

    } catch (e) {
        showFatalError(e);
    }
}

bootstrap();
