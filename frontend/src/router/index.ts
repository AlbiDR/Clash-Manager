import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
    // Use hash history for GitHub Pages compatibility
    // Pass import.meta.env.BASE_URL to ensure it respects the vite.config.ts base path
    history: createWebHashHistory(import.meta.env.BASE_URL),
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
            path: '/warlog',
            name: 'warlog',
            component: () => import('../views/WarLogView.vue'),
            meta: { title: 'War Log' }
        },
        {
            path: '/settings',
            name: 'settings',
            component: () => import('../views/SettingsView.vue'),
            meta: { title: 'Settings' }
        }
    ]
})

// Update document title on navigation
router.afterEach((to) => {
    const baseTitle = 'Clash Manager: Clan Manager for Clash Royale'
    document.title = to.meta.title ? `${to.meta.title} | ${baseTitle}` : baseTitle
})

export default router
