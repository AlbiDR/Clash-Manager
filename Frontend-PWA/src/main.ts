
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
    console.error('FATAL ERROR:', error);
    // If the app hasn't mounted, we should probably show something on screen
    const appEl = document.getElementById('app');
    if (appEl && !appEl.innerHTML.includes('app-container')) {
        appEl.innerHTML = `<div style="padding:20px;color:red;text-align:center;">
            <h1>System Error</h1>
            <p>${error?.message || 'Unknown error during startup'}</p>
            <button onclick="localStorage.clear();window.location.reload()">Factory Reset</button>
        </div>`
    }
}

window.addEventListener('error', (event) => showFatalError(event.error));
window.addEventListener('unhandledrejection', (event) => showFatalError(event.reason));

async function bootstrap() {
    try {
        // 1. Critical Config (Synchronous)
        const modules = useModules(); 
        try { modules.init(); } catch(e) { console.warn('Modules init failed', e) }
        
        const theme = useTheme(); 
        try { theme.init(); } catch(e) { console.warn('Theme init failed', e) }
        
        // 2. Create App
        const app = createApp(App)
        app.use(router)
        
        // ⚡ PERFORMANCE: Register dummy directive first to prevent Vue warnings during hydration
        app.directive('auto-animate', {}) 
        
        app.directive('tooltip', vTooltip)
        app.directive('tactile', vTactile)

        // 3. Mount App Immediately
        // We mount BEFORE loading data to ensure the UI shell is interactive (even if showing skeletons)
        app.mount('#app')

        // 4. Initialize Data (Post-Mount)
        // ⚡ LCP OPTIMIZATION: Load local data in the next tick to allow first paint
        requestAnimationFrame(() => {
            try {
                const clanData = useClanData(); 
                clanData.loadLocal(); 
            } catch (e) {
                console.error("Local data load failed:", e)
            }
        })

        // 5. Defer Non-Critical Systems & Heavy Libraries
        // ⚡ Increased delay to 500ms to ensure LCP is recorded before network/main thread gets busy
        setTimeout(async () => {
            try {
                // Start Network Sync NOW, after visual settle
                const clanData = useClanData();
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
            } catch (e) {
                console.error("Background sync failed:", e)
            }
        }, 500); 

    } catch (e) {
        showFatalError(e);
    }
}

bootstrap();
