import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
    // Use hash history for GitHub Pages compatibility
    history: createWebHashHistory(),
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
            meta: { title: 'Recruiter' }
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
    document.title = `${to.meta.title || 'Home'} | Clash Royale Manager`
})

export default router
