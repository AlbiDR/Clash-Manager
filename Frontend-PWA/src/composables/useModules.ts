import { ref, watch } from "vue";

const MODULES_KEY = "cm_modules_v2";

export interface ModuleState {
  blitzMode: boolean;
  ghostBenchmarking: boolean;
  sortExplanation: boolean;
  backendRefresher: boolean;
  experimentalNotifications: boolean;
  notificationBadgeHighPotential: boolean;
  notificationThreshold: 50 | 75;
  notificationSound: boolean; // Improvement #11
  notificationQuietMode: boolean; // Improvement #5
}

// 📱 Device Detection for Defaults
const isMobile =
  typeof window !== "undefined"
    ? window.matchMedia("(max-width: 768px)").matches
    : false;

const defaultState: ModuleState = {
  blitzMode: false,
  ghostBenchmarking: !isMobile, // On by default on Desktop, Off on Mobile
  sortExplanation: true,
  backendRefresher: false,
  experimentalNotifications: true, // On by default
  notificationBadgeHighPotential: true, // On by default
  notificationThreshold: 75, // Default to high-potential (≥75)
  notificationSound: true,
  notificationQuietMode: false,
};

const modules = ref<ModuleState>({ ...defaultState });
const isInitialized = ref(false);

export function useModules() {
  function init() {
    if (isInitialized.value) return;
    loadFromStorage();
    window.addEventListener("storage", (event) => {
      if (event.key === MODULES_KEY) {
        loadFromStorage();
      }
    });
    isInitialized.value = true;
  }

  function loadFromStorage() {
    try {
      const stored = localStorage.getItem(MODULES_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        modules.value = {
          blitzMode:
            typeof parsed.blitzMode === "boolean"
              ? parsed.blitzMode
              : defaultState.blitzMode,
          ghostBenchmarking:
            typeof parsed.ghostBenchmarking === "boolean"
              ? parsed.ghostBenchmarking
              : defaultState.ghostBenchmarking,
          sortExplanation:
            typeof parsed.sortExplanation === "boolean"
              ? parsed.sortExplanation
              : defaultState.sortExplanation,
          backendRefresher:
            typeof parsed.backendRefresher === "boolean"
              ? parsed.backendRefresher
              : defaultState.backendRefresher,
          experimentalNotifications:
            typeof parsed.experimentalNotifications === "boolean"
              ? parsed.experimentalNotifications
              : defaultState.experimentalNotifications,
          notificationBadgeHighPotential:
            typeof parsed.notificationBadgeHighPotential === "boolean"
              ? parsed.notificationBadgeHighPotential
              : defaultState.notificationBadgeHighPotential,
          notificationThreshold:
            parsed.notificationThreshold === 50 ||
            parsed.notificationThreshold === 75
              ? parsed.notificationThreshold
              : defaultState.notificationThreshold,
          notificationSound:
            typeof parsed.notificationSound === "boolean"
              ? parsed.notificationSound
              : defaultState.notificationSound,
          notificationQuietMode:
            typeof parsed.notificationQuietMode === "boolean"
              ? parsed.notificationQuietMode
              : defaultState.notificationQuietMode,
        };
      } else {
        modules.value = { ...defaultState };
      }
    } catch (e) {
      console.error("Failed to load modules", e);
      modules.value = { ...defaultState };
    }
  }

  watch(
    modules,
    (newVal) => {
      try {
        localStorage.setItem(MODULES_KEY, JSON.stringify(newVal));
      } catch (e) {
        console.error("Failed to save module state", e);
      }
    },
    { deep: true },
  );

  function toggle(key: keyof ModuleState) {
    const val = modules.value[key];
    if (typeof val === "boolean") {
      (modules.value as any)[key] = !val;
    }
  }

  return {
    modules,
    toggle,
    init,
  };
}

export type UseModulesReturn = {
  modules: typeof modules;
  toggle: (key: keyof ModuleState) => void;
  init: () => void;
};
