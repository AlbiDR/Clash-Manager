// @ts-nocheck
import { ref, shallowRef, readonly, watch, triggerRef } from 'vue'
import { loadCache, fetchRemote } from '../api/gasClient'
import type { WebAppData } from '../types'
import { useBadge } from './useBadge'
import { useModules } from './useModules'
import { useDemoMode } from './useDemoMode'
import { generateMockData } from '../utils/mockData'

// Global State
const clanData = shallowRef<WebAppData | null>(null)
const isRefreshing = ref(false)
const lastSyncTime = ref<number | null>(null)
const syncStatus = ref<'idle' | 'syncing' | 'success' | 'error'>('idle')
const syncError = ref<string | null>(null)

const { setBadge } = useBadge()
const { modules } = useModules()
const { isDemoMode } = useDemoMode()

const SNAPSHOT_KEY = 'cm_hydration_snapshot'

export function useClanData() {

    function hydrateFromSnapshot() {
        if (clanData.value || isDemoMode.value) return
        
        // ⚡ PERFORMANCE: Non-blocking parse
        // We wrap the heavy JSON.parse in a Promise to allow the event loop to breathe
        return new Promise<void>((resolve) => {
            const raw = localStorage.getItem(SNAPSHOT_KEY)
            if (raw) {
                // Try to parse. If it blocks for 50ms, so be it, but we are inside a deferred callback now.
                try {
                    const parsed = JSON.parse(raw)
                    clanData.value = parsed
                    lastSyncTime.value = parsed.timestamp || Date.now()
                    updateBadgeCount(parsed)
                    console.log('⚡ Hydration: Loaded from Snapshot')
                } catch (e) {
                    console.warn('Hydration JSON Corrupt', e)
                }
            }
            resolve()
        })
    }

    async function init() {
        // 1. Instant Hydration attempt (LCP reduction)
        await hydrateFromSnapshot()

        if (isDemoMode.value) {
            console.log('🌟 Demo Mode Active')
            const mock = generateMockData()
            clanData.value = mock
            lastSyncTime.value = mock.timestamp
            updateBadgeCount(mock)
            return
        }

        // 2. Fast DB Path (SWR) - Only if snapshot missed or DB is newer
        // This is async and won't block render
        try {
            const cached = await loadCache()
            if (cached) {
                if (!clanData.value || cached.timestamp > (clanData.value.timestamp || 0)) {
                    clanData.value = cached
                    lastSyncTime.value = cached.timestamp
                    updateBadgeCount(cached)
                }
            }
        } catch (e) {
            console.warn("DB Load Failed", e)
        }

        // 3. Background Sync (Network)
        // Delay this slightly to prioritize interactivity
        setTimeout(() => {
            refresh()
        }, 1000)
    }

    function updateBadgeCount(data: WebAppData) {
        if (data?.hh) {
            if (modules.value.notificationBadgeHighPotential) {
                const highPotentialCount = data.hh.filter(r => r.s >= 75).length
                setBadge(highPotentialCount)
            } else {
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
                await new Promise(resolve => setTimeout(resolve, 800))
                const mock = generateMockData()
                clanData.value = mock
                lastSyncTime.value = mock.timestamp
                syncStatus.value = 'success'
                updateBadgeCount(mock)
                return
            }

            const remoteData = await fetchRemote()
            clanData.value = remoteData
            lastSyncTime.value = remoteData.timestamp
            syncStatus.value = 'success'

            // Save to snapshot for next cold start LCP
            // Use requestIdleCallback to save stringified data to prevent frame drops during scroll
            const saveTask = (window as any).requestIdleCallback || setTimeout;
            saveTask(() => {
                localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(remoteData))
            })
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
        
        const currentHH = clanData.value.hh
        const idsSet = new Set(ids)
        const newHH = currentHH.filter(r => !idsSet.has(r.id))

        const oldData = clanData.value
        clanData.value = { ...oldData, hh: newHH }
        
        updateBadgeCount(clanData.value)
        localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(clanData.value))

        try {
            const { dismissRecruits } = await import('../api/gasClient')
            await dismissRecruits(ids)
        } catch (e) {
            clanData.value = oldData
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
