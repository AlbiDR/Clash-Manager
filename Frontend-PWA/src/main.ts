
// @ts-nocheck
import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import router from './router'
// REMOVED: Synchronous import of autoAnimatePlugin
// import { autoAnimatePlugin } from '@formkit/auto-animate/vue'
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
        
        // 2. Create App
        const app = createApp(App)
        app.use(router)
        
        // ⚡ PERFORMANCE: Register dummy directive first to prevent Vue warnings during hydration
        app.directive('auto-animate', {}) 
        
        app.directive('tooltip', vTooltip)
        app.directive('tactile', vTactile)

        // 3. Initialize Data (Synchronous local load + Async remote refresh)
        const clanData = useClanData(); 
        clanData.init(); // Synchronous read

        // 4. Mount (Visual Handover: HTML Shell -> Vue Skeletons)
        // ⚡ CRITICAL OPTIMIZATION:
        // Delay mounting by one animation frame. This guarantees the browser paints 
        // the Static HTML Shell (from index.html) before Vue hydration takes over.
        // This ensures the LCP event is recorded on the static <h1>, not the Vue component.
        requestAnimationFrame(() => {
            app.mount('#app')
        })

        // 5. Defer Non-Critical Systems & Heavy Libraries
        setTimeout(async () => {
            const apiState = useApiState(); apiState.init();
            const wakeLock = useWakeLock(); wakeLock.init();
            
            // ⚡ Lazy Load AutoAnimate
            try {
                const { autoAnimatePlugin } = await import('@formkit/auto-animate/vue')
                app.use(autoAnimatePlugin)
            } catch (e) {
                console.warn('Failed to load animations', e)
            }
        }, 200); 

    } catch (e) {
        showFatalError(e);
    }
}

bootstrap();
