/**
* 🛠️ USE SHOWCASE MODE
 * Global toggle for combining Synthetic and Blueprint modes.
 */
import { useBlueprintMode } from "./useBlueprintMode";
import { useSyntheticMode } from "./useSyntheticMode";

import { ref, watch } from "vue";
const SHOWCASE_KEY = "clash_manager_showcase_mode";

// Global singleton state
const isShowcaseMode = ref(localStorage.getItem(SHOWCASE_KEY) === "true");

export function useShowcaseMode() {
  const { isSyntheticMode, setSyntheticMode } = useSyntheticMode();
  const { isBlueprintMode, setBlueprintMode } = useBlueprintMode();

  // Sync from child toggles to master toggle
  watch(
    [isSyntheticMode, isBlueprintMode],
    ([synthetic, blueprint]) => {
      const bothOn = synthetic && blueprint;
      if (isShowcaseMode.value !== bothOn) {
        isShowcaseMode.value = bothOn;
        localStorage.setItem(SHOWCASE_KEY, String(bothOn));
      }
    },
    { immediate: true },
  );

  function toggleShowcaseMode() {
    const newValue = !isShowcaseMode.value;
    isShowcaseMode.value = newValue;
    localStorage.setItem(SHOWCASE_KEY, String(newValue));

    // Sync from master toggle to child toggles
    // Use setters to avoid reload loops
    setSyntheticMode(newValue);
    setBlueprintMode(newValue);
  }

  function setShowcaseMode(val: boolean) {
    if (isShowcaseMode.value === val) return;
    isShowcaseMode.value = val;
    localStorage.setItem(SHOWCASE_KEY, String(val));
    setSyntheticMode(val);
    setBlueprintMode(val);
  }

  return {
    isShowcaseMode,
    toggleShowcaseMode,
    setShowcaseMode,
  };
}
