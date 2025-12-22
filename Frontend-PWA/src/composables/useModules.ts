
import { ref, watch } from 'vue'

const MODULES_KEY = 'cm_modules_v2'

export interface ModuleState {
    blitzMode: boolean
    ghostBenchmarking: boolean
    sortExplanation: boolean
    backendRefresher: boolean
    experimentalNotifications: boolean
    notificationBadgeHighPotential: boolean
}

// 📱 Device Detection for Defaults
const isMobile = typeof window !== 'undefined' ? window.matchMedia('(max-width: 768px)').matches : false

const defaultState: ModuleState = {
    blitzMode: false,
    ghostBenchmarking: !isMobile, // On by default on Desktop, Off on Mobile
    sortExplanation: false,
    backendRefresher: false,
    experimentalNotifications: true, // On by default
    notificationBadgeHighPotential: true // On by default
}

const modules = ref<ModuleState>({ ...defaultState })
const isInitialized = ref(false)

export function useModules() {
    function init() {
        if (isInitialized.value) return
        loadFromStorage()
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
                modules.value = {
                    blitzMode: typeof parsed.blitzMode === 'boolean' ? parsed.blitzMode : defaultState.blitzMode,
                    ghostBenchmarking: typeof parsed.ghostBenchmarking === 'boolean' ? parsed.ghostBenchmarking : defaultState.ghostBenchmarking,
                    sortExplanation: typeof parsed.sortExplanation === 'boolean' ? parsed.sortExplanation : defaultState.sortExplanation,
                    backendRefresher: typeof parsed.backendRefresher === 'boolean' ? parsed.backendRefresher : defaultState.backendRefresher,
                    experimentalNotifications: typeof parsed.experimentalNotifications === 'boolean' ? parsed.experimentalNotifications : defaultState.experimentalNotifications,
                    notificationBadgeHighPotential: typeof parsed.notificationBadgeHighPotential === 'boolean' ? parsed.notificationBadgeHighPotential : defaultState.notificationBadgeHighPotential
                }
            } else {
                modules.value = { ...defaultState }
            }
        } catch (e) {
            console.error('Failed to load modules', e)
            modules.value = { ...defaultState }
        }
    }

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
