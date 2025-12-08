import { createRouter, createWebHashHistory } from 'vue-router'
import { getModuleEnabled } from '../stores/appSettings'

const router = createRouter({
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
            meta: { title: 'War Log', requiresModule: 'warLog' }
        },
        {
            path: '/settings',
            name: 'settings',
            component: () => import('../views/SettingsView.vue'),
            meta: { title: 'Settings' }
        }
    ]
})

router.beforeEach((to, _from, next) => {
    const requiredModule = to.meta.requiresModule as string | undefined
    if (requiredModule && !getModuleEnabled(requiredModule as 'warLog')) {
        next({ path: '/' })
    } else {
        next()
    }
})

router.afterEach((to) => {
    document.title = `${to.meta.title || 'Home'} | Clash Royale Manager`
})

export default router
