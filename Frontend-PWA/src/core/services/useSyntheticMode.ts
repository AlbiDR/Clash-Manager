/**
 * COMPOSABLE: useSyntheticMode
 * 
 * @remarks
 * Global toggle for high-fidelity mock data demonstration. Decouples the UI
 * from live backend dependencies for showcase and testing purposes.
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
