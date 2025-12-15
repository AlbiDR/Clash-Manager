import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import router from './router'
import { vTooltip } from './directives/vTooltip'
import { useModules } from './composables/useModules'

// --- Global Error Boundary (Prevents White Screen of Death) ---
window.addEventListener('error', (event) => {
    const appEl = document.getElementById('app');
    if (appEl) {
        appEl.innerHTML = `
            <div style="padding: 2rem; color: #ff3333; background: #1a0000; height: 100vh; font-family: monospace;">
                <h1>Application Error</h1>
                <p>The application failed to start.</p>
                <pre style="background: #330000; padding: 1rem; overflow: auto;">${event.message}</pre>
                <p style="margin-top:1rem; opacity:0.7;">Check console for full stack trace.</p>
                <button onclick="window.location.reload()" style="padding: 10px 20px; margin-top: 20px; cursor: pointer;">Reload</button>
            </div>
        `;
    }
    console.error('CRITICAL APP ERROR:', event.error);
});

// 1. Initialize the module store
try {
    const moduleState = useModules()
    moduleState.init()
} catch (e) {
    console.error('Failed to initialize modules:', e)
}

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
