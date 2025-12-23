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

// Error Handler
function showFatalError(error: any) {
    if ((window as any).__hasShownFatalError) return;
    (window as any).__hasShownFatalError = true;
    console.error('FATAL ERROR:', error);
    // Silent fail in production to avoid scary overlays unless strictly necessary
}

window.addEventListener('error', (event) => showFatalError(event.error));
window.addEventListener('unhandledrejection', (event) => showFatalError(event.reason));

// ⚡ PERFORMANCE: Instant Bootstrap
// We do NOT await anything here. We mount immediately.
function bootstrap() {
    try {
        // 1. Initialize Sync logic (Reactive state setup only, no heavy parsing)
        const modules = useModules(); modules.init();
        const theme = useTheme(); theme.init();
        
        // 2. Create App
        const app = createApp(App)
        app.use(router)
        app.use(autoAnimatePlugin)
        app.directive('tooltip', vTooltip)
        app.directive('tactile', vTactile)

        // 3. Mount (Replaces #app-shell instantly)
        app.mount('#app')

        // 4. Defer Heavy Data Loading (Hydration)
        // Pushing this to the next idle tick ensures the Paint happens first.
        const defer = (window as any).requestIdleCallback || ((cb: Function) => setTimeout(cb, 10));
        
        defer(() => {
            const clanData = useClanData(); 
            // This triggers the JSON.parse of the massive dataset
            clanData.init().then(() => {
                // Once data is loaded, we can init less critical stuff
                const apiState = useApiState(); apiState.init();
                const wakeLock = useWakeLock(); wakeLock.init();
            });
        });

    } catch (e) {
        showFatalError(e);
    }
}

bootstrap();
