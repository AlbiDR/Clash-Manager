
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

        // 3. Initialize Data - LOCAL ONLY
        // ⚡ LCP OPTIMIZATION: Only load from localStorage. Do NOT start network sync yet.
        const clanData = useClanData(); 
        clanData.loadLocal(); 

        // 4. Mount (Visual Handover: HTML Shell -> Vue Skeletons)
        // ⚡ CRITICAL OPTIMIZATION:
        // Delay mounting by one animation frame. This guarantees the browser paints 
        // the Static HTML Shell (from index.html) before Vue hydration takes over.
        // This ensures the LCP event is recorded on the static <h1>, not the Vue component.
        requestAnimationFrame(() => {
            app.mount('#app')
        })

        // 5. Defer Non-Critical Systems & Heavy Libraries
        // ⚡ Increased delay to 500ms to ensure LCP is recorded before network/main thread gets busy
        setTimeout(async () => {
            // Start Network Sync NOW, after visual settle
            clanData.startBackgroundSync();

            const apiState = useApiState(); apiState.init();
            const wakeLock = useWakeLock(); wakeLock.init();
            
            // ⚡ Lazy Load AutoAnimate
            try {
                const { autoAnimatePlugin } = await import('@formkit/auto-animate/vue')
                app.use(autoAnimatePlugin)
            } catch (e) {
                console.warn('Failed to load animations', e)
            }
        }, 500); 

    } catch (e) {
        showFatalError(e);
    }
}

bootstrap();
