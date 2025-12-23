// @ts-nocheck
import { ref } from 'vue'

const STORAGE_KEY = 'cm_recruit_tombstones'

// Singleton state to share across components
const tombstones = ref<Set<string>>(new Set())
const isInitialized = ref(false)

export function useRecruitBlacklist() {
    
    function init() {
        if (isInitialized.value) return
        try {
            const raw = localStorage.getItem(STORAGE_KEY)
            if (raw) {
                const parsed = JSON.parse(raw)
                if (Array.isArray(parsed)) {
                    tombstones.value = new Set(parsed)
                }
            }
        } catch (e) {
            console.warn('Failed to load recruit blacklist', e)
        }
        isInitialized.value = true
    }

    function save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify([...tombstones.value]))
        } catch (e) {
            console.error('Failed to save recruit blacklist', e)
        }
    }

    function hide(ids: string[]) {
        ids.forEach(id => tombstones.value.add(id))
        save()
    }

    function restore(ids: string[]) {
        ids.forEach(id => tombstones.value.delete(id))
        save()
    }

    /**
     * 🧹 GARBAGE COLLECTION
     * Removes IDs from local storage if they are NO LONGER in the server payload.
     * This implies the server has processed the delete, so we don't need to track it locally anymore.
     * 
     * @param currentServerIds List of IDs currently returned by the API
     */
    function prune(currentServerIds: string[]) {
        if (currentServerIds.length === 0) return // Don't prune on empty/error states

        const serverSet = new Set(currentServerIds)
        const toDelete: string[] = []

        tombstones.value.forEach(id => {
            // If the server doesn't have it, it's gone for good. Remove tombstone.
            // If the server STILL has it (stale cache), keep tombstone to hide it.
            if (!serverSet.has(id)) {
                toDelete.push(id)
            }
        })

        if (toDelete.length > 0) {
            toDelete.forEach(id => tombstones.value.delete(id))
            save()
        }
    }

    // Initialize on import
    init()

    return {
        tombstones,
        hide,
        restore,
        prune
    }
}
