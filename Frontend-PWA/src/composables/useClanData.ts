// @ts-nocheck
import { ref, shallowRef, readonly, watch, triggerRef } from 'vue'
import { loadCache, fetchRemote, inflatePayload } from '../api/gasClient'
import type { WebAppData } from '../types'
import { useBadge } from './useBadge'
import { useModules } from './useModules'
import { useDemoMode } from './useDemoMode'
import { generateMockData } from '../utils/mockData'

// Global State
const clanData = shallowRef<WebAppData | null>(null)
// Initialize as hydrated=false to force Skeletons on first paint
const isHydrated = ref(false) 
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
        if (clanData.value || isDemoMode.value) {
            isHydrated.value = true
            return
        }
        
        // ⚡ PERFORMANCE: Parallel Execution
        // We do NOT wait for disk read to finish before starting network request.
        // This cuts the TTI by the time it takes to read from IDB.
        
        // 1. Start Network Sync (Optimistic)
        startBackgroundSync()

        // 2. Read from Disk (Immediate visual feedback)
        const yieldThread = (window as any).requestIdleCallback || ((cb: Function) => setTimeout(cb, 1));

        yieldThread(() => {
            try {
                const raw = localStorage.getItem(SNAPSHOT_KEY)
                if (raw) {
                    const parsed = JSON.parse(raw)
                    // Only apply snapshot if we haven't already received fresh data
                    if (!clanData.value) {
                        clanData.value = parsed
                        lastSyncTime.value = parsed.timestamp || Date.now()
                        updateBadgeCount(parsed)
                        console.log('⚡ Instant Hydration: Success')
                    }
                }
            } catch (e) {
                console.warn('Hydration failed', e)
            } finally {
                // Signal that initial data load attempt is done
                isHydrated.value = true
            }
        })
    }

    async function init() {
        // Trigger hydration sequence
        hydrateFromSnapshot()
    }

    async function startBackgroundSync() {
        if (isDemoMode.value) {
            console.log('🌟 Demo Mode Active')
            const mock = generateMockData()
            clanData.value = mock
            lastSyncTime.value = mock.timestamp
            updateBadgeCount(mock)
            return
        }

        // Fast DB Path (SWR) via IDB
        try {
            const cached = await loadCache()
            if (cached) {
                if (!clanData.value || cached.timestamp > (clanData.value?.timestamp || 0)) {
                    clanData.value = cached
                    lastSyncTime.value = cached.timestamp
                    updateBadgeCount(cached)
                }
            }
        } catch (e) {
            console.warn("DB Load Failed", e)
        }

        // Network Sync
        refresh()
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

            // ⚡ DEEP NET INTEGRATION: Check for preloaded promise
            let remoteData: WebAppData
            
            if ((window as any).__CM_PRELOAD__) {
                console.log('⚡ Consuming Deep Net Preload...')
                // Added semicolon to prevent ASI failure with next line starting with (
                const preloadedEnvelope = await (window as any).__CM_PRELOAD__;
                (window as any).__CM_PRELOAD__ = null // Consume once
                
                if (preloadedEnvelope && preloadedEnvelope.data) {
                    remoteData = await inflatePayload(preloadedEnvelope.data)
                } else {
                    // Fallback if preload failed
                    remoteData = await fetchRemote()
                }
            } else {
                remoteData = await fetchRemote()
            }

            clanData.value = remoteData
            lastSyncTime.value = remoteData.timestamp
            syncStatus.value = 'success'

            // Save to snapshot for next cold start LCP
            // Use requestIdleCallback to avoid blocking input during save
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
        isHydrated: readonly(isHydrated),
        isRefreshing: readonly(isRefreshing),
        syncStatus: readonly(syncStatus),
        syncError: readonly(syncError),
        lastSyncTime: readonly(lastSyncTime),
        init,
        refresh,
        dismissRecruitsAction
    }
}
