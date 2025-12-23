
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
    const stack = error?.stack || 'No stack trace available.';

    if (msg.includes('Failed to fetch dynamically imported module')) {
        window.location.reload();
        return;
    }

    document.body.innerHTML = '';
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `position: fixed; inset: 0; z-index: 99999; padding: 2rem; color: #ffcccc; background: #1a0505; font-family: monospace; overflow: auto;`;
    errorDiv.innerHTML = `<h1 style="color: #ff4444;">Application Crash</h1><p>${msg}</p><pre style="font-size: 10px; opacity: 0.7;">${stack}</pre><button onclick="location.reload()">Reload</button>`;
    document.body.appendChild(errorDiv);
}

window.addEventListener('error', (event) => showFatalError(event.error));
window.addEventListener('unhandledrejection', (event) => showFatalError(event.reason));

async function bootstrap() {
    try {
        const moduleState = useModules(); moduleState.init();
        const apiState = useApiState(); apiState.init();
        const themeState = useTheme(); themeState.init();
        const wakeLock = useWakeLock(); wakeLock.init();
        const clanData = useClanData(); clanData.init();

        const app = createApp(App)
        app.use(router)
        app.use(autoAnimatePlugin)
        app.directive('tooltip', vTooltip)
        app.directive('tactile', vTactile)

        app.mount('#app')

        // 🚀 TRANSITION: Remove the HTML shell once Vue takes over
        const shell = document.getElementById('app-shell-loader');
        if (shell) {
            shell.style.opacity = '0';
            setTimeout(() => shell.remove(), 300);
        }

    } catch (e) {
        showFatalError(e);
    }
}

bootstrap();
