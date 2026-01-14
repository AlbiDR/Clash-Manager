/**
 * 🛠️ USE EXHIBITION MODE
 * Global toggle for combining Demo and Blueprint modes.
 */
import { ref, watch } from "vue";
import { useDemoMode } from "./useDemoMode";
import { useBlueprintMode } from "./useBlueprintMode";

const EXHIBITION_KEY = "clash_manager_exhibition_mode";

// Global singleton state
const isExhibitionMode = ref(localStorage.getItem(EXHIBITION_KEY) === "true");

export function useExhibitionMode() {
  const { isDemoMode, setDemoMode } = useDemoMode();
  const { isBlueprintMode, setBlueprintMode } = useBlueprintMode();

  // Sync from child toggles to master toggle
  watch(
    [isDemoMode, isBlueprintMode],
    ([demo, blueprint]) => {
      const bothOn = demo && blueprint;
      if (isExhibitionMode.value !== bothOn) {
        isExhibitionMode.value = bothOn;
        localStorage.setItem(EXHIBITION_KEY, String(bothOn));
      }
    },
    { immediate: true },
  );

  function toggleExhibitionMode() {
    const newValue = !isExhibitionMode.value;
    isExhibitionMode.value = newValue;
    localStorage.setItem(EXHIBITION_KEY, String(newValue));

    // Sync from master toggle to child toggles
    // Use setters to avoid reload loops
    setDemoMode(newValue);
    setBlueprintMode(newValue);

    // Reload to apply changes globally
    window.location.reload();
  }

  function setExhibitionMode(val: boolean) {
    if (isExhibitionMode.value === val) return;
    isExhibitionMode.value = val;
    localStorage.setItem(EXHIBITION_KEY, String(val));
    setDemoMode(val);
    setBlueprintMode(val);
  }

  return {
    isExhibitionMode,
    toggleExhibitionMode,
    setExhibitionMode,
  };
}
