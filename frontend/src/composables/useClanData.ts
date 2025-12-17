
import { ref, readonly, watch } from 'vue'
import { loadCache, fetchRemote } from '../api/gasClient'
import type { WebAppData } from '../types'
import { useBadge } from './useBadge'

// Global State
const clanData = ref<WebAppData | null>(null)
const isRefreshing = ref(false)
const lastSyncTime = ref<number | null>(null)
const syncStatus = ref<'idle' | 'syncing' | 'success' | 'error'>('idle')
const syncError = ref<string | null>(null)

const { setBadge } = useBadge()

export function useClanData() {

    async function init() {
        const cached = loadCache()
        if (cached) {
            clanData.value = cached
            lastSyncTime.value = cached.timestamp
            // Initial badge update based on cache
            updateBadgeCount(cached)
        }
        await refresh()
    }

    function updateBadgeCount(data: WebAppData) {
        // Badge represents number of recruits in pool
        if (data.hh) {
            setBadge(data.hh.length)
        }
    }

    async function refresh() {
        if (isRefreshing.value) return

        try {
            isRefreshing.value = true
            syncStatus.value = 'syncing'
            syncError.value = null

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
