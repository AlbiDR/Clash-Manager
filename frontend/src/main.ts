import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import router from './router'
import { vTooltip } from './directives/vTooltip'
import { useModules } from './composables/useModules' // ✅ NEW IMPORT

// 1. Initialize the module store to load state from localStorage
const moduleState = useModules()
moduleState.init()

const app = createApp(App)

app.use(router)
app.directive('tooltip', vTooltip)
app.mount('#app')

// Register PWA Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {
            // SW registration failed, app still works
        })
    })
}