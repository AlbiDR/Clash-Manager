
import { ref, watch } from 'vue'

const MODULES_KEY = 'cm_modules_v3' // Bump version to reset defaults

export interface ModuleState {
    blitzMode: boolean
}

const defaultState: ModuleState = {
    blitzMode: false // Explicitly OFF by default
}

// Global singleton state to ensure reactivity across all components
const modules = ref<ModuleState>({ ...defaultState })
const isInitialized = ref(false)

export function useModules() {
    function init() {
        if (isInitialized.value) return

        // 1. Initial Load
        loadFromStorage()

        // 2. Cross-Tab Sync (Listen for changes in other windows)
        window.addEventListener('storage', (event) => {
            if (event.key === MODULES_KEY) {
                loadFromStorage()
            }
        })

        isInitialized.value = true
    }

    function loadFromStorage() {
        try {
            const stored = localStorage.getItem(MODULES_KEY)
            if (stored) {
                const parsed = JSON.parse(stored)
                
                // Robust Merge: Only accept known keys with correct types
                // This prevents state corruption from bad local storage data
                modules.value = {
                    blitzMode: typeof parsed.blitzMode === 'boolean' ? parsed.blitzMode : defaultState.blitzMode
                }
            } else {
                // No data found, enforce defaults
                modules.value = { ...defaultState }
            }
        } catch (e) {
            console.error('Failed to load modules, resetting to defaults', e)
            modules.value = { ...defaultState }
            localStorage.removeItem(MODULES_KEY)
        }
    }

    // Persist changes to LocalStorage
    watch(modules, (newVal) => {
        try {
            localStorage.setItem(MODULES_KEY, JSON.stringify(newVal))
        } catch (e) {
            console.error('Failed to save module state', e)
        }
    }, { deep: true })

    function toggle(key: keyof ModuleState) {
        modules.value[key] = !modules.value[key]
    }

    return {
        modules,
        toggle,
        init
    }
}

