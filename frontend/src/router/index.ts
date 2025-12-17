
import { createRouter, createWebHashHistory } from 'vue-router'

// Memory for tab scroll positions
const scrollPositions = new Map<string, number>()

const router = createRouter({
    history: createWebHashHistory(import.meta.env.BASE_URL),
    scrollBehavior(to, from, savedPosition) {
        if (savedPosition) return savedPosition
        if (scrollPositions.has(to.path)) return { top: scrollPositions.get(to.path) }
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
    // Only apply if the browser supports it
    if (!(document as any).startViewTransition) return

    return new Promise((resolve) => {
        (document as any).startViewTransition(async () => {
            resolve(true)
        })
    })
})

router.beforeEach((to, from) => {
    scrollPositions.set(from.path, window.scrollY)
})

router.afterEach((to) => {
    const baseTitle = 'Clash Manager: Clan Manager for Clash Royale'
    document.title = to.meta.title ? `${to.meta.title} | ${baseTitle}` : baseTitle
})

export default router
