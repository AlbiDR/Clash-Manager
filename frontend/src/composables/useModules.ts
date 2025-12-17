
import { ref, watch } from 'vue'

const MODULES_KEY = 'cm_modules_v2'

export interface ModuleState {
    blitzMode?: boolean
}

const defaultState: ModuleState = {
    blitzMode: false
}

// Global state
const modules = ref<ModuleState>(defaultState)
const isInitialized = ref(false)

export function useModules() {
    function init() {
        if (isInitialized.value) return

        try {
            const stored = localStorage.getItem(MODULES_KEY)
            if (stored) {
                modules.value = { ...defaultState, ...JSON.parse(stored) }
            }
        } catch (e) {
            console.error('Failed to load modules', e)
        }
        isInitialized.value = true
    }

    // Persist on change
    watch(modules, (newVal) => {
        localStorage.setItem(MODULES_KEY, JSON.stringify(newVal))
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

