import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import router from './router'
import { autoAnimatePlugin } from '@formkit/auto-animate/vue'
import { vTooltip } from './directives/vTooltip'
import { vTactile } from './directives/vTactile'
import { useModules } from './composables/useModules'
import { useApiState } from './composables/useApiState'
import { useClanData } from './composables/useClanData'
import { useTheme } from './composables/useTheme'
import { useWakeLock } from './composables/useWakeLock'

function showFatalError(error: any) {
    if ((window as any).__hasShownFatalError) return;
    (window as any).__hasShownFatalError = true;
    console.error('FATAL ERROR CAUGHT:', error);
    const msg = error?.message || String(error);
    if (msg.includes('Failed to fetch dynamically imported module')) {
        window.location.reload();
        return;
    }
    document.body.innerHTML = '';
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `position: fixed; inset: 0; z-index: 99999; padding: 2rem; color: #ffcccc; background: #1a0505; font-family: monospace; overflow: auto;`;
    errorDiv.innerHTML = `<h1 style="color: #ff4444;">Application Crash</h1><p>${msg}</p><button onclick="location.reload()">Reload</button>`;
    document.body.appendChild(errorDiv);
}

window.addEventListener('error', (event) => showFatalError(event.error));
window.addEventListener('unhandledrejection', (event) => showFatalError(event.reason));

async function bootstrap() {
    try {
        // 1. Critical Config (Immediate)
        const modules = useModules(); modules.init();
        const theme = useTheme(); theme.init();
        const clanData = useClanData(); 
        
        // Start init but don't await the DB/API part yet (LCP priority)
        const initPromise = clanData.init();

        // 2. App Instance
        const app = createApp(App)
        app.use(router)
        app.use(autoAnimatePlugin)
        app.directive('tooltip', vTooltip)
        app.directive('tactile', vTactile)

        // 3. Early Mount
        app.mount('#app')

        // 4. Cleanup Shell
        const shell = document.getElementById('app-shell-loader');
        if (shell) {
            shell.style.opacity = '0';
            setTimeout(() => shell.remove(), 200);
        }

        // 5. Non-Critical Deferred Init
        const apiState = useApiState(); apiState.init();
        const wakeLock = useWakeLock(); wakeLock.init();
        
        await initPromise;

    } catch (e) {
        showFatalError(e);
    }
}

bootstrap();
