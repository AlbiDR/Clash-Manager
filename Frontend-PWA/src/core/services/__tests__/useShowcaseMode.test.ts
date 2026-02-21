import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref, nextTick } from "vue";

// Mock child composables
const isSyntheticMode = ref(false);
const setSyntheticMode = vi.fn((val: boolean) => { isSyntheticMode.value = val; });
vi.mock("../useSyntheticMode", () => ({
  useSyntheticMode: () => ({ isSyntheticMode, setSyntheticMode }),
}));

const isBlueprintMode = ref(false);
const setBlueprintMode = vi.fn((val: boolean) => { isBlueprintMode.value = val; });
vi.mock("../useBlueprintMode", () => ({
  useBlueprintMode: () => ({ isBlueprintMode, setBlueprintMode }),
}));

describe("useShowcaseMode", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    localStorage.clear();
    isSyntheticMode.value = false;
    isBlueprintMode.value = false;
  });

  it("initializes from localStorage and stays true if children are true", async () => {
    localStorage.setItem("clash_manager_showcase_mode", "true");
    isSyntheticMode.value = true;
    isBlueprintMode.value = true;
    const { useShowcaseMode } = await import("../useShowcaseMode");
    const { isShowcaseMode } = useShowcaseMode();

    // The immediate watch will run, but synthetic and blueprint are true, so it stays true
    expect(isShowcaseMode.value).toBe(true);
  });

  it("initializes from localStorage but becomes false if children are false", async () => {
    localStorage.setItem("clash_manager_showcase_mode", "true");
    isSyntheticMode.value = false;
    isBlueprintMode.value = false;
    const { useShowcaseMode } = await import("../useShowcaseMode");
    const { isShowcaseMode } = useShowcaseMode();

    // The immediate watch runs and sees children are false, so it sets showcase to false
    expect(isShowcaseMode.value).toBe(false);
    expect(localStorage.getItem("clash_manager_showcase_mode")).toBe("false");
  });

  it("syncs to master toggle when both child toggles are on", async () => {
    const { useShowcaseMode } = await import("../useShowcaseMode");
    const { isShowcaseMode } = useShowcaseMode();

    expect(isShowcaseMode.value).toBe(false);

    isSyntheticMode.value = true;
    isBlueprintMode.value = true;

    await nextTick();
    expect(isShowcaseMode.value).toBe(true);
    expect(localStorage.getItem("clash_manager_showcase_mode")).toBe("true");
  });

  it("setShowcaseMode updates both child toggles", async () => {
    const { useShowcaseMode } = await import("../useShowcaseMode");
    const { isShowcaseMode, setShowcaseMode } = useShowcaseMode();

    setShowcaseMode(true);
    expect(isShowcaseMode.value).toBe(true);
    expect(setSyntheticMode).toHaveBeenCalledWith(true);
    expect(setBlueprintMode).toHaveBeenCalledWith(true);
    expect(localStorage.getItem("clash_manager_showcase_mode")).toBe("true");
  });

  it("toggleShowcaseMode flips the state and updates children", async () => {
    const { useShowcaseMode } = await import("../useShowcaseMode");
    const { isShowcaseMode, toggleShowcaseMode } = useShowcaseMode();

    expect(isShowcaseMode.value).toBe(false);
    toggleShowcaseMode();
    expect(isShowcaseMode.value).toBe(true);
    expect(setSyntheticMode).toHaveBeenCalledWith(true);
    expect(setBlueprintMode).toHaveBeenCalledWith(true);

    toggleShowcaseMode();
    expect(isShowcaseMode.value).toBe(false);
    expect(setSyntheticMode).toHaveBeenCalledWith(false);
    expect(setBlueprintMode).toHaveBeenCalledWith(false);
  });
});
