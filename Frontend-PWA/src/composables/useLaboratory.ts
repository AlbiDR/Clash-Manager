import { ref, computed, type Ref, watch } from 'vue'
import LaboratoryKernel from '../logic/Laboratory/Laboratory_Kernel'
import LaboratoryAdapter from '../logic/Laboratory/Laboratory_Adapter'
import { IMPORTANT_KING_LEVELS } from '../logic/Laboratory/Laboratory_Tables'
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
const STORAGE_KEY_OBSERVATION = "laboratory_observation";

// Global state to persist data across view changes
const observation: Ref<PlayerData | null> = ref(null)

const storedSettings = JSON.parse(localStorage.getItem(STORAGE_KEY_SETTINGS) || "{}");
// Migration for legacy strategy names
if (storedSettings.strategy === "Target") storedSettings.strategy = "Projection";
if (storedSettings.strategy === "Maximize") storedSettings.strategy = "Efficiency";

const settings: Ref<OptimizationSettings> = ref({
  strategy: "Projection",
  allowGemSpending: false,
  infiniteResources: false,
  targetLevel: undefined,
  ...storedSettings
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

/**
 * Persists the entire observation to localStorage for instant hydration.
 */
function persistObservation(data: PlayerData | null) {
  if (data) {
    localStorage.setItem(STORAGE_KEY_OBSERVATION, JSON.stringify(data));
  } else {
    localStorage.removeItem(STORAGE_KEY_OBSERVATION);
  }
}

/**
 * Calculates the next logical target King Level based on milestones or next level.
 */
function calculateDefaultTarget(currentLevel: number): number {
  const nextMilestone = IMPORTANT_KING_LEVELS.find(m => m > currentLevel);
  return nextMilestone || (currentLevel + 1);
}

export function useLaboratory() {
  const { data: clashData } = useClashData()

  // --- CORE METHODS (Hoisted) ---

  function analyze() {
    if (!observation.value) return
    isSimulating.value = true
    
    requestAnimationFrame(() => {
       if (observation.value) {
         operation.value = LaboratoryKernel.optimize(observation.value, settings.value)
       }
       isSimulating.value = false
    })
  }

  function ingest(rawSnapshot: any, rawInventory?: any) {
    const data = LaboratoryAdapter.hydrate(rawSnapshot, rawInventory);
    data.inventory = loadPersistedInventory(data);
    observation.value = data;

    const currentLevel = data.profile.kingLevel;
    if (!settings.value.targetLevel || settings.value.targetLevel <= currentLevel) {
      settings.value = {
        ...settings.value,
        targetLevel: calculateDefaultTarget(currentLevel)
      };
    }

    persistObservation(observation.value)
    analyze()
  }

  async function fetchTrackedPlayer() {
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

  function updateInventory(partialInventory: Partial<Inventory>) {
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

    localStorage.setItem(STORAGE_KEY_INVENTORY, JSON.stringify(newInventory));
    persistObservation(observation.value);
    analyze()
  }

  function setSettings(newSettings: Partial<OptimizationSettings>) {
    settings.value = { ...settings.value, ...newSettings }
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings.value));
    analyze()
  }

  // --- INITIALIZATION & WATCHERS ---

  if (!observation.value) {
    const cached = localStorage.getItem(STORAGE_KEY_OBSERVATION);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed && (!clashData.value?.playerTag || parsed.profile.tag === clashData.value.playerTag)) {
          observation.value = parsed;
          analyze();
        }
      } catch (e) {
        console.warn("[Laboratory] Cache hydration failed", e);
      }
    }
  }

  watch(() => clashData.value?.playerTag, (newTag) => {
    if (newTag) {
      if (!observation.value) {
        fetchTrackedPlayer()
      } else {
        analyze()
      }
    }
  }, { immediate: true })

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
