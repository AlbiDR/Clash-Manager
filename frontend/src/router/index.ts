
import { createRouter, createWebHashHistory } from 'vue-router'

const SCROLL_KEY = 'cm_scroll_positions'

// Persistent scroll restoration logic
function saveScrollPosition(path: string, y: number) {
    try {
        const store = JSON.parse(sessionStorage.getItem(SCROLL_KEY) || '{}')
        store[path] = y
        sessionStorage.setItem(SCROLL_KEY, JSON.stringify(store))
    } catch (e) { /* ignore */ }
}

function getSavedScroll(path: string): number {
    try {
        const store = JSON.parse(sessionStorage.getItem(SCROLL_KEY) || '{}')
        return store[path] || 0
    } catch (e) { return 0 }
}

const router = createRouter({
    history: createWebHashHistory(import.meta.env.BASE_URL),
    scrollBehavior(to, from, savedPosition) {
        // 1. Browser Back/Forward: Use browser's saved position
        if (savedPosition) return savedPosition
        
        // 2. Tab Navigation: Restore from our persistent SessionStorage
        const y = getSavedScroll(to.path)
        if (y > 0) return { top: y, behavior: 'instant' } // 'instant' prevents jumpy animation on load
        
        // 3. Default: Top
        return { top: 0 }
    },
    routes: [
        {
            path: '/',
            name: 'leaderboard',
            component: () => import('../views/LeaderboardView.vue'),
            meta: { title: 'Leaderboard' }
        },
        {
            path: '/recruiter',
            name: 'recruiter',
            component: () => import('../views/RecruiterView.vue'),
            meta: { title: 'Headhunter' }
        },
        {
            path: '/settings',
            name: 'settings',
            component: () => import('../views/SettingsView.vue'),
            meta: { title: 'Settings' }
        }
    ]
})

// ⚡ FIX: View Transitions Support
// This wraps every route change in a native "Resolve" animation
router.beforeResolve(async (to, from) => {
    if (!(document as any).startViewTransition) return
    return new Promise((resolve) => {
        (document as any).startViewTransition(async () => {
            resolve(true)
        })
    })
})

// Save scroll before leaving route
router.beforeEach((to, from) => {
    saveScrollPosition(from.path, window.scrollY)
})

router.afterEach((to) => {
    const baseTitle = 'Clash Manager: Clan Manager for Clash Royale'
    document.title = to.meta.title ? `${to.meta.title} | ${baseTitle}` : baseTitle
})

export default router
