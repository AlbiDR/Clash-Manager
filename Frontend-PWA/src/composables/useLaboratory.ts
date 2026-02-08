import { ref, computed, type Ref, watch } from 'vue'
import LaboratoryKernel from '../logic/Laboratory/Laboratory_Kernel'
import LaboratoryAdapter from '../logic/Laboratory/Laboratory_Adapter'
import { useClashData } from './useClashData'
import { getPlayerProfile } from '../api/gasClient'
import type { 
  PlayerData, 
  OptimizationSettings, 
  OptimizationResult, 
  Inventory 
} from '../logic/Laboratory/Laboratory_Types'

const STORAGE_KEY_SETTINGS = "laboratory_settings";
const STORAGE_KEY_INVENTORY = "laboratory_inventory";

// Global state to persist data across view changes
const observation: Ref<PlayerData | null> = ref(null)

const settings: Ref<OptimizationSettings> = ref({
  strategy: "Target",
  infiniteResources: false,
  targetLevel: undefined,
  ...(JSON.parse(localStorage.getItem(STORAGE_KEY_SETTINGS) || "{}"))
})

const operation: Ref<OptimizationResult | null> = ref(null)
const isSimulating = ref(false)
const isFetching = ref(false)
const fetchError = ref<string | null>(null)

// Load inventory persistence
const loadPersistedInventory = (profileData: PlayerData) => {
  const stored = localStorage.getItem(STORAGE_KEY_INVENTORY);
  if (stored) {
    try {
      const persisted = JSON.parse(stored);
      return {
        ...profileData.inventory,
        ...persisted,
        wildCards: {
          ...profileData.inventory.wildCards,
          ...(persisted.wildCards || {})
        }
      };
    } catch (e) {
      console.warn("[Laboratory] Failed to parse persisted inventory");
    }
  }
  return profileData.inventory;
};

export function useLaboratory() {
  const { data: clashData } = useClashData()

  /**
   * Ingests raw data (e.g. from RoyaleAPI or Internal Store) and hydrates the Laboratory.
   */
  const ingest = (rawSnapshot: any, rawInventory?: any) => {
    const data = LaboratoryAdapter.hydrate(rawSnapshot, rawInventory);
    // Apply persistence to the freshly hydrated data
    data.inventory = loadPersistedInventory(data);
    observation.value = data;
    analyze() // Auto-analyze on ingestion
  }

  /**
   * Fetches the player profile from the backend using the tracked PlayerTag
   */
  const fetchTrackedPlayer = async () => {
    // Use global selection logic
    const tag = clashData.value?.playerTag
    if (!tag) return

    isFetching.value = true
    fetchError.value = null
    try {
      const profile = await getPlayerProfile(tag)
      ingest(profile)
    } catch (e: any) {
      console.error("[Laboratory] Fetch Failed:", e)
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

    // Persist changes
    localStorage.setItem(STORAGE_KEY_INVENTORY, JSON.stringify(newInventory));
    
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
         operation.value = LaboratoryKernel.optimize(observation.value, settings.value)
       }
       isSimulating.value = false
    })
  }

  const setSettings = (newSettings: Partial<OptimizationSettings>) => {
    settings.value = { ...settings.value, ...newSettings }
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings.value));
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
