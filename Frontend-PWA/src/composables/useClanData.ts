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
// Initialize as hydrated=false to force Skeletons on first paint ONLY if we have no cache
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
        
        // ⚡ INSTANT PAINT: Synchronous LocalStorage Read
        // We sacrifice ~5ms of main thread time here to ensure the very first frame 
        // renders DATA instead of SKELETONS if we have it.
        try {
            const raw = localStorage.getItem(SNAPSHOT_KEY)
            if (raw) {
                // We assume LocalStorage contains a valid pre-parsed structure or raw matrix
                // We use a "fast inflation" that skips Zod validation for speed.
                const parsed = JSON.parse(raw)
                // If it's the full WebAppData shape already (legacy) or matrix
                inflatePayload(parsed, true).then(data => {
                    clanData.value = data
                    lastSyncTime.value = data.timestamp || Date.now()
                    isHydrated.value = true // Data is ready, render immediately
                    updateBadgeCount(data)
                    console.log('⚡ Instant Paint: Hydrated from Snapshot')
                })
            }
        } catch (e) {
            console.warn('Snapshot hydration failed', e)
        }

        // ⚡ BACKGROUND SYNC: Decoupled
        // We delay the heavy network/IDB logic until the browser has likely painted the first frame.
        // 100ms delay ensures the UI thread is free for animations/transitions on mount.
        setTimeout(() => {
            startBackgroundSync()
        }, 100)
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
            isHydrated.value = true
            return
        }

        // Fast DB Path (SWR) via IDB - Check if IDB has newer data than LocalStorage
        try {
            const cached = await loadCache()
            if (cached) {
                if (!clanData.value || cached.timestamp > (clanData.value?.timestamp || 0)) {
                    clanData.value = cached
                    lastSyncTime.value = cached.timestamp
                    updateBadgeCount(cached)
                    isHydrated.value = true // Ensure hydrated if we missed LS but hit IDB
                }
            }
        } catch (e) {
            console.warn("DB Load Failed", e)
        }

        // Network Sync - Always run to get fresh data
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

            // ⚡ DEEP NET INTEGRATION: Check for preloaded promise from index.html
            let remoteData: WebAppData
            
            if ((window as any).__CM_PRELOAD__) {
                console.log('⚡ Consuming Deep Net Preload...')
                // Added semicolon to prevent ASI failure with next line starting with (
                const preloadedEnvelope = await (window as any).__CM_PRELOAD__;
                (window as any).__CM_PRELOAD__ = null // Consume once
                
                if (preloadedEnvelope && preloadedEnvelope.data) {
                    // Preload already happened, but we still need to inflate/validate
                    remoteData = await inflatePayload(preloadedEnvelope.data, false)
                } else {
                    // Fallback if preload failed or was null
                    remoteData = await fetchRemote()
                }
            } else {
                remoteData = await fetchRemote()
            }

            clanData.value = remoteData
            lastSyncTime.value = remoteData.timestamp
            syncStatus.value = 'success'
            isHydrated.value = true

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
