import { getPlayerProfile } from "@core/api/GasClient";
import { useClashDataStore } from "@core";
import { storeToRefs } from "pinia";
import {
  asGold,
  asGems,
  asXP
} from "@core";
import { ref, computed, type Ref, watch } from 'vue'

// Progression Engine 2.0 Primitives
import {
  calculateProgressionPath,
  ProfileHydrator,
  KING_XP_TABLE,
  IMPORTANT_KING_LEVELS,
  type PlayerData,
  type OptimizationSettings,
  type SimulationState,
  type Inventory,
  type Rarity,
  type OptimizationResult
} from '../logic';

/**
 * @remarks
 * The Laboratory optimization domain manages the simulation of player progression.
 * It utilizes a Singleton Pattern for state persistence to ensure that simulation
 * results and user settings remain consistent across view navigations.
 *
 * Performance is maintained through generator-based simulation processing
 * which avoids blocking the main UI thread.
 */

const STORAGE_KEY_SETTINGS = "laboratory_settings";
const STORAGE_KEY_INVENTORY = "laboratory_inventory";
const STORAGE_KEY_OBSERVATION = "laboratory_observation";

const observation: Ref<PlayerData | null> = ref(null)

const storedSettings = JSON.parse(localStorage.getItem(STORAGE_KEY_SETTINGS) || "{}");

// MIGRATION: LEGACY COMPATIBILITY
// Intent: Standardize strategy names from earlier versions (e.g. v9) to the current domain language.
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

// Performance Control Block
let currentSimulationId = 0;
let lastAnalyzedTag: string | null = null;

/**
 * Maps the internal SimulationState to the legacy OptimizationResult for UI compatibility.
 *
 * @param state - The current state of the simulation.
 * @param originalProfile - The original player profile before simulation.
 * @returns A formatted result compatible with existing UI components.
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

/**
 * Merges persisted inventory overrides with the hydrated player profile data.
 *
 * @param profileData - Hydrated player data from the API.
 * @returns The final inventory state including local overrides.
 */
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

/**
 * Persists the current player observation to LocalStorage.
 *
 * @param data - The player data to persist.
 */
function persistObservation(data: PlayerData | null) {
  if (data) {
    localStorage.setItem(STORAGE_KEY_OBSERVATION, JSON.stringify(data));
  } else {
    localStorage.removeItem(STORAGE_KEY_OBSERVATION);
  }
}

/**
 * Determines the next logical King Level milestone for target projection.
 *
 * @param currentLevel - Current King Level.
 * @returns The next milestone level.
 */
function calculateDefaultTarget(currentLevel: number): number {
  const nextMilestone = IMPORTANT_KING_LEVELS.find(m => m > currentLevel);
  return nextMilestone || (currentLevel + 1);
}

/**
 * Primary composable for Laboratory operations.
 *
 * @returns {Object} Laboratory state and methods.
 *
 * **Reactive State:**
 * - `observation`: Current hydrated player profile and inventory.
 * - `operation`: The result of the current simulation run.
 * - `settings`: User-defined optimization constraints.
 * - `isSimulating`: Boolean indicating if simulation logic is running.
 * - `isFetching`: Boolean indicating if a profile fetch is in progress.
 * - `fetchError`: Error message if the profile fetch fails.
 *
 * **Side Effects:**
 * - Writes settings, inventory, and profile data to `LocalStorage`.
 * - Triggers asynchronous simulation via `requestIdleCallback`.
 * - Fetches data from the GAS backend when `playerTag` changes.
 */
export function useLaboratory() {
  const clashDataStore = useClashDataStore();
  const { data: clashData } = storeToRefs(clashDataStore);

  let currentSimulation: Generator<SimulationState, SimulationState, void> | null = null;

  /**
   * Triggers the progression simulation engine.
   *
   * @remarks
   * Utilizes a generator-based simulation loop processed in ~10ms chunks
   * to maintain UI responsiveness (60FPS).
   */
  function analyze() {
    if (!observation.value) return
    
    // Prevent redundant analysis if same target already processed
    const currentTag = observation.value.profile.tag;
    if (isSimulating.value && lastAnalyzedTag === currentTag) return;
    lastAnalyzedTag = currentTag;

    const simId = ++currentSimulationId;
    isSimulating.value = true
    
    const s = settings.value;
    const forceInfinite = s.strategy === "Level Projection";
    
    const engineSettings: OptimizationSettings = {
      ...s,
      infiniteResources: forceInfinite
    };

    const initialState = ProfileHydrator.createInitialState(observation.value);
    currentSimulation = calculateProgressionPath(initialState, engineSettings);

    const processBatch = () => {
      // Cancellation check: if a newer simulation has started, abort this one.
      if (simId !== currentSimulationId || !currentSimulation) return;

      let lastState: SimulationState | null = null;
      let startTime = performance.now();
      const BATCH_TIME_MS = 10;
      
      while (performance.now() - startTime < BATCH_TIME_MS) {
        const { value, done } = currentSimulation.next();
        if (done) {
          if (value && simId === currentSimulationId) {
            operation.value = mapStateToResult(value, observation.value?.profile);
          }
          if (simId === currentSimulationId) {
            currentSimulation = null;
            isSimulating.value = false;
          }
          return;
        }
        lastState = value;
      }

      // Update intermediate state for progress feeling - throttled to ~30fps
      if (lastState && simId === currentSimulationId) {
        operation.value = mapStateToResult(lastState, observation.value?.profile);
      }

      if (window.requestIdleCallback) {
        window.requestIdleCallback(processBatch);
      } else {
        setTimeout(processBatch, 16); // 16ms approx 60fps, but logic uses 10ms budget
      }
    };

    if (window.requestIdleCallback) {
      window.requestIdleCallback(processBatch);
    } else {
      setTimeout(processBatch, 0);
    }
  }

  /**
   * Processes raw player snapshot and inventory into the internal hydrated state.
   *
   * @param rawSnapshot - Raw player profile from API.
   * @param rawInventory - Optional inventory overrides.
   */
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

  /**
   * Fetches the profile of the currently tracked player.
   */
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

  /**
   * Updates the internal inventory state and persists it.
   *
   * @param partialInventory - The partial inventory updates to apply.
   */
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

  /**
   * Updates Laboratory optimization settings and persists them.
   *
   * @param newSettings - The partial settings updates to apply.
   */
  function setSettings(newSettings: Partial<OptimizationSettings>) {
    const nextSettings = { ...settings.value, ...newSettings };
    
    // Auto-toggle infiniteResources based on strategy
    if (newSettings.strategy) {
      nextSettings.infiniteResources = (newSettings.strategy === "Level Projection");
    }

    settings.value = nextSettings;
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings.value));
    analyze()
  }

  // Initial hydration from Cache
  if (!observation.value) {
    const cached = localStorage.getItem(STORAGE_KEY_OBSERVATION);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        const currentGlobalTag = clashData.value?.playerTag;
        if (parsed && (!currentGlobalTag || parsed.profile.tag === currentGlobalTag)) {
          // Re-hydrate to ensure branded types and new structure
          observation.value = ProfileHydrator.hydrate(parsed);
          // Only trigger analysis if tags match or no tag filter applied
          analyze();
        }
      } catch (e) {
        console.warn("[Laboratory] Cache hydration failed", e);
      }
    }
  }

  watch(() => clashData.value?.playerTag, (newTag, oldTag) => {
    if (newTag && newTag !== oldTag) {
      if (!observation.value || observation.value.profile.tag !== newTag) {
        fetchTrackedPlayer()
      } else {
        analyze()
      }
    }
  }, { immediate: false }) // Initial run handled by hydration block above

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
    handleVaultUpdate(key: string, value: number) {
      if (key === 'gold') updateInventory({ gold: value });
      else if (key === 'gems') updateInventory({ gems: value });
      else if (key.startsWith('wc_')) {
        const rawRarity = key.split('_')[1];
        const capitalized = (rawRarity.charAt(0).toUpperCase() + rawRarity.slice(1)) as Rarity;
        updateInventory({
          wildCards: {
            [capitalized]: value
          } as Partial<Record<Rarity, number>>
        });
      }
    },
    refresh: fetchTrackedPlayer
  }
}
