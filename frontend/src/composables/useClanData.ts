import { ref, readonly } from 'vue'
import { loadCache, fetchRemote } from '../api/gasClient'
import type { WebAppData } from '../types'

// Global State
const clanData = ref<WebAppData | null>(null)
const isRefreshing = ref(false)
const lastSyncTime = ref<number | null>(null)
const syncStatus = ref<'idle' | 'syncing' | 'success' | 'error'>('idle')
const syncError = ref<string | null>(null)
// New: State for the heavy backend update process
const isUpdatingCloud = ref(false)

export function useClanData() {

    /**
     * Initializes the data layer.
     * 1. Loads from local cache immediately (Optimistic UI)
     * 2. Triggers a background refresh
     */
    async function init() {
        // 1. Load Cache
        const cached = loadCache()
        if (cached) {
            clanData.value = cached
            lastSyncTime.value = cached.timestamp
        }

        // 2. Background Sync
        await refresh()
    }

    /**
     * Refreshes data from the server.
     * Implements Mutex locking via isRefreshing flag.
     */
    async function refresh() {
        if (isRefreshing.value) return

        try {
            isRefreshing.value = true
            syncStatus.value = 'syncing'
            syncError.value = null

            const remoteData = await fetchRemote()

            // Compare timestamps (if we have local data)
            // If remote is newer or we have no data, update.
            // Note: In v6, we trust the server's data is the "truth". 
            // We can add a check if remote.timestamp > current.timestamp if strictly needed,
            // but usually we want to ensure eventual consistency.

            clanData.value = remoteData
            lastSyncTime.value = remoteData.timestamp
            syncStatus.value = 'success'

            // Artificial delay for "Success" state visibility if it was too fast? 
            // No, user wants instant.
        } catch (e: any) {
            console.error('Sync failed:', e)
            syncStatus.value = 'error'
            syncError.value = e.message || 'Sync failed'
        } finally {
            isRefreshing.value = false
            // Reset status to idle after a delay so the UI can clear
            setTimeout(() => {
                if (syncStatus.value === 'success' || syncStatus.value === 'error') {
                    // Optional: keep 'error' visible until dismissed? 
                    // For now, let's leave it, or reset to idle if we want to hide the indicator.
                    // The requirement says: "Display a 'Syncing...' indicator... Do not show full-screen loading skeleton if cache exists."
                    // It doesn't explicitly say to hide it on success, but it's implied.
                    if (syncStatus.value === 'success') syncStatus.value = 'idle'
                }
            }, 2000)
        }
    }

    /**
     * Optimistically dismisses recruits.
     * 1. Updates local state immediately.
     * 2. Calls backend.
     * 3. Reverts on failure.
     */
    async function dismissRecruitsAction(ids: string[]) {
        if (!clanData.value) return

        const originalHH = [...clanData.value.hh]
        const idsSet = new Set(ids)

        // Optimistic Update
        clanData.value = {
            ...clanData.value,
            hh: originalHH.filter(r => !idsSet.has(r.id))
        }

        try {
            // Import dynamically or pass as dependency to avoid circular deps if needed, 
            // but gasClient is pure.
            const { dismissRecruits } = await import('../api/gasClient')
            await dismissRecruits(ids)
            // Success: do nothing, state is already correct.
            // Optionally update timestamp if backend returns it, but dismiss usually doesn't return full payload.
        } catch (e) {
            console.error('Dismiss failed, reverting:', e)
            // Revert
            if (clanData.value) {
                clanData.value = {
                    ...clanData.value,
                    hh: originalHH
                }
            }
            throw e
        }
    }

    /**
     * Triggers the full backend update sequence (Headless).
     * Then refreshes the local cache to get the new data.
     */
    async function triggerCloudUpdate() {
        if (isUpdatingCloud.value || isRefreshing.value) return

        try {
            isUpdatingCloud.value = true
            const { triggerBackendUpdate } = await import('../api/gasClient')
            await triggerBackendUpdate()

            // After successful trigger, fetch the new data
            await refresh()

        } catch (e: any) {
            console.error('Cloud update failed:', e)
            syncError.value = e.message || 'Cloud update failed'
        } finally {
            isUpdatingCloud.value = false
        }
    }

    return {
        // State
        data: readonly(clanData),
        isRefreshing: readonly(isRefreshing),
        syncStatus: readonly(syncStatus),
        syncError: readonly(syncError),
        lastSyncTime: readonly(lastSyncTime),
        isUpdatingCloud: readonly(isUpdatingCloud),

        // Actions
        init,
        refresh,
        dismissRecruitsAction,
        triggerCloudUpdate
    }
}
