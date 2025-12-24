// @ts-nocheck
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
    console.error('FATAL ERROR:', error);
}

window.addEventListener('error', (event) => showFatalError(event.error));
window.addEventListener('unhandledrejection', (event) => showFatalError(event.reason));

function bootstrap() {
    try {
        // 1. Critical Config (Synchronous)
        const modules = useModules(); modules.init();
        const theme = useTheme(); theme.init();
        
        // 2. Initialize Data Store *BEFORE* Mount
        // This ensures the initial render of App.vue has access to synchronous localStorage data
        // skipping the Skeleton state entirely if data exists.
        const clanData = useClanData(); 
        clanData.init();

        // 3. Create App
        const app = createApp(App)
        app.use(router)
        app.use(autoAnimatePlugin)
        app.directive('tooltip', vTooltip)
        app.directive('tactile', vTactile)

        // 4. Mount (Seamless Visual Handover: HTML Shell -> Vue Content)
        app.mount('#app')

        // 5. Non-Critical Systems (Deferred)
        const defer = (window as any).requestIdleCallback || ((cb: Function) => setTimeout(cb, 200));
        defer(() => {
            const apiState = useApiState(); apiState.init();
            const wakeLock = useWakeLock(); wakeLock.init();
        });

    } catch (e) {
        showFatalError(e);
    }
}

bootstrap();
