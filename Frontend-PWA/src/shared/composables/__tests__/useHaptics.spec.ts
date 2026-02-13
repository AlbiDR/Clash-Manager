import { useHaptics } from "../useHaptics";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { nextTick } from "vue";

describe("useHaptics", () => {
  const mockVibrate = vi.fn();
  let batteryMock: any;

  beforeEach(() => {
    vi.clearAllMocks();

    batteryMock = {
      level: 1,
      charging: true,
      saveData: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    vi.stubGlobal("navigator", {
      vibrate: mockVibrate,
      getBattery: vi.fn().mockResolvedValue(batteryMock),
    });

    // Reset interaction state by reloading the module or just accepting it's fresh if not singleton
    // useHaptics returns a NEW object each time, but hasInteracted is defined at module level!
    // Wait, let's check useHaptics.ts again.
  });

  it("should not vibrate if no interaction has occurred", () => {
    const haptics = useHaptics();
    haptics.tap();
    expect(mockVibrate).not.toHaveBeenCalled();
  });

  it("should vibrate after interaction", () => {
    const haptics = useHaptics();

    // Simulate interaction
    window.dispatchEvent(new Event("click"));

    haptics.tap();
    expect(mockVibrate).toHaveBeenCalledWith(12);
  });

  it("should scale down vibration in low power mode (battery level low)", async () => {
    batteryMock.level = 0.1;
    batteryMock.charging = false;

    const haptics = useHaptics();

    // Wait for getBattery promise and update()
    await new Promise(resolve => setTimeout(resolve, 0));
    await nextTick();

    expect(haptics.isLowPowerMode.value).toBe(true);

    window.dispatchEvent(new Event("click"));
    haptics.medium(); // normal is 25
    expect(mockVibrate).toHaveBeenCalledWith(20); // 25 - 5
  });

  it("should scale down vibration in low power mode (saveData enabled)", async () => {
    batteryMock.saveData = true;

    const haptics = useHaptics();
    await new Promise(resolve => setTimeout(resolve, 0));
    await nextTick();

    expect(haptics.isLowPowerMode.value).toBe(true);

    window.dispatchEvent(new Event("click"));
    haptics.success(); // normal is [10, 30, 10]
    expect(mockVibrate).toHaveBeenCalledWith([5, 25, 5]);
  });

  it("should provide various haptic patterns", () => {
    const haptics = useHaptics();
    window.dispatchEvent(new Event("click"));

    haptics.heavy();
    expect(mockVibrate).toHaveBeenCalledWith(35);

    haptics.error();
    expect(mockVibrate).toHaveBeenCalledWith([60, 40, 60]);

    haptics.rareFind();
    expect(mockVibrate).toHaveBeenCalledWith([15, 30, 80]);
  });
});
