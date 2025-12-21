
import { ref, readonly, watch } from 'vue'
import { loadCache, fetchRemote } from '../api/gasClient'
import type { WebAppData } from '../types'
import { useBadge } from './useBadge'
import { useModules } from './useModules'
import { useDemoMode } from './useDemoMode'
import { generateMockData } from '../utils/mockData'

// Global State
const clanData = ref<WebAppData | null>(null)
const isRefreshing = ref(false)
const lastSyncTime = ref<number | null>(null)
const syncStatus = ref<'idle' | 'syncing' | 'success' | 'error'>('idle')
const syncError = ref<string | null>(null)

const { setBadge } = useBadge()
const { modules } = useModules()
const { isDemoMode } = useDemoMode()

// React to setting changes immediately
watch(() => modules.value.notificationBadgeHighPotential, () => {
    if (clanData.value) {
        // Redefined locally or imported logic to update badge
        if (clanData.value.hh) {
            if (modules.value.notificationBadgeHighPotential) {
                const highPotentialCount = clanData.value.hh.filter(r => r.s >= 75).length
                setBadge(highPotentialCount)
            } else {
                setBadge(clanData.value.hh.length)
            }
        }
    }
})
export function useClanData() {

    async function init() {
        // Prevent double init if data is already present
        if (clanData.value) return

        if (isDemoMode.value) {
            console.log('🌟 Demo Mode Active: Initializing with mock data.')
            const mock = generateMockData()
            clanData.value = mock
            lastSyncTime.value = mock.timestamp
            updateBadgeCount(mock)
            return
        }

        try {
            const cached = await loadCache()
            if (cached) {
                clanData.value = cached
                lastSyncTime.value = cached.timestamp
                // Initial badge update based on cache
                updateBadgeCount(cached)
            }
        } catch (e) {
            console.warn("Fast Cache Load Failed", e)
        }

        // Trigger background refresh after cache check
        await refresh()
    }

    function updateBadgeCount(data: WebAppData) {
        // Badge represents number of recruits in pool
        if (data.hh) {
            if (modules.value.notificationBadgeHighPotential) {
                // Filter for recruits with score >= 75
                const highPotentialCount = data.hh.filter(r => r.s >= 75).length
                setBadge(highPotentialCount)
            } else {
                // Default: Count all recruits
                setBadge(data.hh.length)
            }
        }
    }

    async function refresh() {
        if (isRefreshing.value) return

        try {
            isRefreshing.value = true
            syncStatus.value = 'syncing'
            syncError.value = null

            if (isDemoMode.value) {
                // Simulate network latency for "Demo" effect
                await new Promise(resolve => setTimeout(resolve, 1200))
                const mock = generateMockData()
                clanData.value = mock
                lastSyncTime.value = mock.timestamp
                syncStatus.value = 'success'
                updateBadgeCount(mock)
                return
            }

            // Network Intelligence: Check if we should do a "Lite" fetch
            const connection = (navigator as any).connection
            const isSlow = connection && (connection.saveData || ['slow-2g', '2g', '3g'].includes(connection.effectiveType))

            if (isSlow) {
                console.log('📡 Slow connection detected. Prioritizing core data.')
            }

            const remoteData = await fetchRemote()
            clanData.value = remoteData
            lastSyncTime.value = remoteData.timestamp
            syncStatus.value = 'success'

            updateBadgeCount(remoteData)

        } catch (e: any) {
            console.error('Sync failed:', e)
            syncStatus.value = 'error'
            syncError.value = e.message || 'Sync failed'
        } finally {
            isRefreshing.value = false
            setTimeout(() => {
                if (syncStatus.value === 'success') syncStatus.value = 'idle'
            }, 2000)
        }
    }

    async function dismissRecruitsAction(ids: string[]) {
        if (!clanData.value) return
        const originalHH = [...clanData.value.hh]
        const idsSet = new Set(ids)

        clanData.value = {
            ...clanData.value,
            hh: originalHH.filter(r => !idsSet.has(r.id))
        }

        updateBadgeCount(clanData.value)

        try {
            const { dismissRecruits } = await import('../api/gasClient')
            await dismissRecruits(ids)
        } catch (e) {
            clanData.value = { ...clanData.value, hh: originalHH }
            updateBadgeCount(clanData.value)
            throw e
        }
    }

    return {
        data: readonly(clanData),
        isRefreshing: readonly(isRefreshing),
        syncStatus: readonly(syncStatus),
        syncError: readonly(syncError),
        lastSyncTime: readonly(lastSyncTime),
        init,
        refresh,
        dismissRecruitsAction
    }
}
