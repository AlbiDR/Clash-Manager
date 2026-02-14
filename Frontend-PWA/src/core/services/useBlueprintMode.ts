/**
 * COMPOSABLE: useBlueprintMode
 * 
 * @remarks
 * Global toggle for forcing skeleton view. Strips UI to geometric skeletons
 * to audit layout stability and interaction design without content distraction.
 */
import { ref } from "vue";

const BLUEPRINT_KEY = "clash_manager_blueprint_mode";

// Global singleton state
const isBlueprintMode = ref(localStorage.getItem(BLUEPRINT_KEY) === "true");

export function useBlueprintMode() {
  function toggleBlueprintMode() {
    isBlueprintMode.value = !isBlueprintMode.value;
    localStorage.setItem(BLUEPRINT_KEY, String(isBlueprintMode.value));
  }

  function setBlueprintMode(val: boolean) {
    isBlueprintMode.value = val;
    localStorage.setItem(BLUEPRINT_KEY, String(val));
  }

  return {
    isBlueprintMode: isBlueprintMode, // Keep as ref for reactivity
    toggleBlueprintMode,
    setBlueprintMode,
  };
}
