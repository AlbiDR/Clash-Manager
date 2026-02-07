import { ref, computed, type Ref, watch } from 'vue'
import QuartermasterKernel from '../logic/Quartermaster/Quartermaster_Kernel'
import QuartermasterAdapter from '../logic/Quartermaster/Quartermaster_Adapter'
import { useClashData } from './useClashData'
import { getPlayerProfile } from '../api/gasClient'
import type { 
  PlayerData, 
  OptimizationSettings, 
  OptimizationResult, 
  Inventory 
} from '../logic/Quartermaster/Quartermaster_Types'

// Global state to persist data across view changes
const observation: Ref<PlayerData | null> = ref(null)

const settings: Ref<OptimizationSettings> = ref({
  useGems: false,
  infiniteGold: false,
  targetKingLevel: undefined
})

const operation: Ref<OptimizationResult | null> = ref(null)
const isSimulating = ref(false)
const isFetching = ref(false)
const fetchError = ref<string | null>(null)

export function useQuartermaster() {
  const { data: clashData } = useClashData()

  /**
   * Ingests raw data (e.g. from RoyaleAPI or Internal Store) and hydrates the Quartermaster.
   */
  const ingest = (rawSnapshot: any, rawInventory?: any) => {
    observation.value = QuartermasterAdapter.hydrate(rawSnapshot, rawInventory)
    analyze() // Auto-analyze on ingestion
  }

  /**
   * Fetches the player profile from the backend using the tracked PlayerTag
   */
  const fetchTrackedPlayer = async () => {
    // TEMP: Use hardcoded tag for testing, but fallback to global selection logic
    const tag = clashData.value?.playerTag || "#PP80QG99"
    if (!tag) return

    isFetching.value = true
    fetchError.value = null
    try {
      const profile = await getPlayerProfile(tag)
      ingest(profile)
    } catch (e: any) {
      console.error("[Quartermaster] Fetch Failed:", e)
      fetchError.value = e.message || "Failed to fetch player profile"
    } finally {
      isFetching.value = false
    }
  }

  // Watch for playerTag changes to re-fetch
  watch(() => clashData.value?.playerTag, (newTag) => {
    if (newTag && !observation.value) {
      fetchTrackedPlayer()
    }
  }, { immediate: true })

  /**
   * Updates specific inventory items (e.g. from UI inputs).
   */
  const updateInventory = (partialInventory: Partial<Inventory>) => {
    if (!observation.value) return
    
    const newInventory = {
      ...observation.value.inventory,
      ...partialInventory,
      wildCards: {
        ...observation.value.inventory.wildCards,
        ...(partialInventory.wildCards || {})
      }
    }

    observation.value = {
      ...observation.value,
      inventory: newInventory
    }
    analyze() // Re-analyze on inventory change
  }

  /**
   * Runs the optimization kernel based on current observation and settings.
   */
  const analyze = () => {
    if (!observation.value) return

    isSimulating.value = true
    
    // Low-priority execution to keep UI responsive
    requestAnimationFrame(() => {
       if (observation.value) {
         operation.value = QuartermasterKernel.optimize(observation.value, settings.value)
       }
       isSimulating.value = false
    })
  }

  const setSettings = (newSettings: Partial<OptimizationSettings>) => {
    settings.value = { ...settings.value, ...newSettings }
    analyze() // Re-analyze on settings change
  }

  return {
    observation: computed(() => observation.value),
    operation: computed(() => operation.value),
    settings: computed(() => settings.value),
    isSimulating,
    isFetching,
    fetchError,

    ingest,
    updateInventory,
    analyze,
    setSettings,
    refresh: fetchTrackedPlayer
  }
}
