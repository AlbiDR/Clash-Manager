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
        const clanData = useClanData();
        
        // ⚡ INSTANT HYDRATION:
        // Trigger hydration immediately so that if data is in LocalStorage, 
        // `isHydrated` is true BEFORE the app mounts. 
        // This effectively eliminates the "Skeleton Flash" for returning users.
        clanData.init();
        
        // 2. Create App
        const app = createApp(App)
        app.use(router)
        app.use(autoAnimatePlugin)
        app.directive('tooltip', vTooltip)
        app.directive('tactile', vTactile)

        // 3. Mount (Visual Handover: HTML Shell -> Vue App)
        app.mount('#app')

        // 4. Non-Critical Systems (Deferred)
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
