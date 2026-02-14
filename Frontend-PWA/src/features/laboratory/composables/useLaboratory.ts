import { getPlayerProfile } from "@core/api/GasClient";
import { useClashData } from "@core/services/useClashData";
import { ref, computed, type Ref, watch } from 'vue'

// Progression Engine 2.0 Primitives
import { calculateProgressionPath } from '@/logic/Laboratory/Simulation';
import ProfileHydrator from '@/logic/Laboratory/ProfileHydrator';
import { KING_XP_TABLE } from '@/logic/Laboratory/Registry';
import { asGold, asGems, asXP } from '@/logic/Laboratory/Economy';

import type { 
  PlayerData, 
  OptimizationSettings, 
  SimulationState,
  Inventory,
  Rarity
} from '@/logic/Laboratory/Types';

// Legacy compatibility type for the UI
export interface OptimizationResult {
  readonly actions: any[];
  readonly totalXpGained: number;
  readonly projectedKingLevel: number;
  readonly finalProfile: any;
  readonly finalGold: number;
  readonly finalGems: number;
  readonly totalGoldSpent: number;
  readonly totalGemsSpent: number;
  readonly totalWildCardsUsed: Record<Rarity, number>;
}

const STORAGE_KEY_SETTINGS = "laboratory_settings";
const STORAGE_KEY_INVENTORY = "laboratory_inventory";
const STORAGE_KEY_OBSERVATION = "laboratory_observation";

const observation: Ref<PlayerData | null> = ref(null)

const storedSettings = JSON.parse(localStorage.getItem(STORAGE_KEY_SETTINGS) || "{}");

// MIGRATION: LEGACY COMPATIBILITY
if (storedSettings.strategy === "Target") storedSettings.strategy = "Level Projection";
if (storedSettings.strategy === "Maximize") storedSettings.strategy = "Resource Efficiency";

const settings: Ref<OptimizationSettings> = ref({
  strategy: "Level Projection",
  allowGemSpending: false,
  infiniteResources: false,
  targetLevel: undefined,
  ...storedSettings
})

const operation: Ref<OptimizationResult | null> = ref(null)
const isSimulating = ref(false)
const isFetching = ref(false)
const fetchError = ref<string | null>(null)

/**
 * Maps the internal SimulationState to the legacy OptimizationResult for UI compatibility.
 */
function mapStateToResult(state: SimulationState, originalProfile: any): OptimizationResult {
  let kingLevel = 1;
  let xpIntoLevel = 0;
  
  for (const row of KING_XP_TABLE) {
    if (state.totalXp >= Number(row.cumulative)) {
      kingLevel = row.level;
      xpIntoLevel = Number(state.totalXp) - Number(row.cumulative);
    } else {
      break;
    }
  }

  const initialTotalXp = Number(ProfileHydrator.createInitialState(observation.value!).totalXp);

  return {
    actions: state.history as any[],
    totalXpGained: Number(state.totalXp) - initialTotalXp,
    projectedKingLevel: kingLevel,
    finalProfile: {
      ...originalProfile,
      kingLevel,
      xpIntoLevel
    },
    finalGold: Number(state.inventory.gold),
    finalGems: Number(state.inventory.gems),
    totalGoldSpent: Number(state.totalGoldSpent),
    totalGemsSpent: Number(state.totalGemsSpent),
    totalWildCardsUsed: state.totalWildCardsUsed as Record<Rarity, number>
  };
}

const loadPersistedInventory = (profileData: PlayerData) => {
  const stored = localStorage.getItem(STORAGE_KEY_INVENTORY);
  if (stored) {
    try {
      const persisted = JSON.parse(stored);
      return {
        ...profileData.inventory,
        ...persisted,
        gold: asGold(persisted.gold ?? Number(profileData.inventory.gold)),
        gems: asGems(persisted.gems ?? Number(profileData.inventory.gems)),
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

function persistObservation(data: PlayerData | null) {
  if (data) {
    localStorage.setItem(STORAGE_KEY_OBSERVATION, JSON.stringify(data));
  } else {
    localStorage.removeItem(STORAGE_KEY_OBSERVATION);
  }
}

function calculateDefaultTarget(currentLevel: number): number {
  const nextMilestone = [2, 3, 5, 7, 10, 14, 18, 22, 26, 30, 34, 38, 42, 54, 75].find(m => m > currentLevel);
  return nextMilestone || (currentLevel + 1);
}

export function useLaboratory() {
  const { data: clashData } = useClashData()

  let currentSimulation: Generator<SimulationState, SimulationState, void> | null = null;

  /**
   * REFACTORED: Generator-based simulation loop.
   * Processes the simulation in small chunks to keep the UI at 60FPS.
   */
  function analyze() {
    if (!observation.value) return
    isSimulating.value = true
    
    const initialState = ProfileHydrator.createInitialState(observation.value);
    currentSimulation = calculateProgressionPath(initialState, settings.value);

    const processBatch = () => {
      if (!currentSimulation) return;

      let lastState: SimulationState | null = null;
      let startTime = performance.now();
      
      // Process for 10ms per frame to avoid blocking
      while (performance.now() - startTime < 10) {
        const { value, done } = currentSimulation.next();
        if (done) {
          if (value) operation.value = mapStateToResult(value, observation.value?.profile);
          currentSimulation = null;
          isSimulating.value = false;
          return;
        }
        lastState = value;
      }

      // Update intermediate state for progress feeling
      if (lastState) {
        operation.value = mapStateToResult(lastState, observation.value?.profile);
      }

      if (window.requestIdleCallback) {
        window.requestIdleCallback(processBatch);
      } else {
        setTimeout(processBatch, 0);
      }
    };

    if (window.requestIdleCallback) {
      window.requestIdleCallback(processBatch);
    } else {
      setTimeout(processBatch, 0);
    }
  }

  function ingest(rawSnapshot: any, rawInventory?: any) {
    const data = ProfileHydrator.hydrate(rawSnapshot);
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
    
    // Convert numbers back to branded types if necessary
    const newInventory: Inventory = {
      ...observation.value.inventory,
      ...partialInventory,
      gold: asGold(partialInventory.gold !== undefined ? Number(partialInventory.gold) : Number(observation.value.inventory.gold)),
      gems: asGems(partialInventory.gems !== undefined ? Number(partialInventory.gems) : Number(observation.value.inventory.gems)),
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

  if (!observation.value) {
    const cached = localStorage.getItem(STORAGE_KEY_OBSERVATION);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed && (!clashData.value?.playerTag || parsed.profile.tag === clashData.value.playerTag)) {
          // Re-hydrate to ensure branded types and new structure
          observation.value = ProfileHydrator.hydrate(parsed);
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
