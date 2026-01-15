/**
 * 🛠️ USE SYNTHETIC MODE
 * Global toggle for mock data demonstration.
 */
import { ref } from "vue";

const SYNTHETIC_KEY = "clash_manager_synthetic_mode";

// Global singleton state
const isSyntheticMode = ref(localStorage.getItem(SYNTHETIC_KEY) === "true");

export function useSyntheticMode() {
  function toggleSyntheticMode() {
    isSyntheticMode.value = !isSyntheticMode.value;
    localStorage.setItem(SYNTHETIC_KEY, String(isSyntheticMode.value));
  }

  function setSyntheticMode(val: boolean) {
    isSyntheticMode.value = val;
    localStorage.setItem(SYNTHETIC_KEY, String(val));
  }

  return {
    isSyntheticMode, // Keep as ref for reactivity
    toggleSyntheticMode,
    setSyntheticMode,
  };
}
