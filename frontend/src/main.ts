import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import router from './router'
import { vTooltip } from './directives/vTooltip'

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
