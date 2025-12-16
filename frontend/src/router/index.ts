import { createRouter, createWebHashHistory } from 'vue-router'

// Memory for tab scroll positions
const scrollPositions = new Map<string, number>()

const router = createRouter({
    // Use hash history for GitHub Pages compatibility
    // Pass import.meta.env.BASE_URL to ensure it respects the vite.config.ts base path
    history: createWebHashHistory(import.meta.env.BASE_URL),
    
    // ⚡ FIX: Intelligent Scroll Restoration
    scrollBehavior(to, from, savedPosition) {
        // 1. Native History Navigation (Back/Forward buttons) - Always trust the browser
        if (savedPosition) {
            return savedPosition
        }
        
        // 2. Tab Switching (Manual Memory) - Restore previous position if known
        if (scrollPositions.has(to.path)) {
            return { top: scrollPositions.get(to.path) }
        }

        // 3. Default (First visit) - Snap to top
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

// Save scroll position before leaving a route
router.beforeEach((to, from) => {
    scrollPositions.set(from.path, window.scrollY)
})

// Update document title on navigation
router.afterEach((to) => {
    const baseTitle = 'Clash Manager: Clan Manager for Clash Royale'
    document.title = to.meta.title ? `${to.meta.title} | ${baseTitle}` : baseTitle
})

export default router
