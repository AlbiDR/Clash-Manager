import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import router from './router'
import { vTooltip } from './directives/vTooltip'
import { useModules } from './composables/useModules'
import { useApiState } from './composables/useApiState'
import { useClanData } from './composables/useClanData'

// 🚨 CRITICAL ERROR HANDLER
// This ensures that if the app crashes (White Screen), the error is shown to the user.
function showFatalError(error: any) {
    const appEl = document.getElementById('app');
    if (!appEl) return;
    
    // Prevent double-rendering
    if (appEl.getAttribute('data-error-rendered')) return;
    appEl.setAttribute('data-error-rendered', 'true');

    const msg = error?.message || String(error);
    const stack = error?.stack || 'No stack trace available.';

    appEl.innerHTML = `
        <div style="
            position: fixed; inset: 0; z-index: 9999;
            padding: 2rem; color: #ffcccc; background: #1a0505; 
            font-family: 'Courier New', monospace; overflow: auto;
            display: flex; flex-direction: column; gap: 1rem;
        ">
            <h1 style="color: #ff4444; margin: 0; font-size: 24px;">Application Crash</h1>
            <p style="margin: 0; font-size: 16px; line-height: 1.5;">${msg}</p>
            <div style="background: rgba(0,0,0,0.3); padding: 1rem; border-left: 4px solid #ff4444; white-space: pre-wrap; font-size: 12px;">${stack}</div>
            <button onclick="window.location.reload()" style="
                padding: 12px 24px; background: #ff4444; color: white; border: none; 
                border-radius: 4px; font-weight: bold; cursor: pointer; width: fit-content;
                margin-top: 1rem;
            ">
                Reload App
            </button>
        </div>
    `;
    console.error('FATAL:', error);
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

        const clanData = useClanData()
        // We do NOT await this, as it handles its own SWR (Stale-While-Revalidate)
        clanData.init()

        // 2. Mount App
        const app = createApp(App)

        app.use(router)
        app.directive('tooltip', vTooltip)

        app.mount('#app')

        // 3. Register PWA Service Worker
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/Clash-Manager/sw.js').catch((err) => {
                    console.log('SW registration failed', err)
                })
            })
        }
    } catch (e) {
        showFatalError(e);
    }
}

bootstrap();
