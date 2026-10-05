// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import { useBlitzMode } from "../useBlitzMode";
import { useSelectionStore } from "@core/services/useSelectionStore";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AndroidBridge, WindowWithBridge } from "@core/types";

const mockOpenInGame = vi.fn();
const mockInfo = vi.fn();
const mockError = vi.fn();
const mockModules = vi.hoisted(() => ({
  blitzMode: true,
  blitzSpeed: "fast",
  blitzDwellMs: undefined as number | undefined,
}));

vi.mock("@core/services/useExternalLink", () => ({
  useExternalLink: () => ({
    openInGame: mockOpenInGame,
  }),
  buildDeepLink: (id: string) => `id=${id}`,
}));

vi.mock("@core/services/useToast", () => ({
  useToast: () => ({
    info: mockInfo,
    error: mockError,
  }),
}));

vi.mock("@core/services/useAppSettings", () => ({
  useAppSettings: () => ({
    modules: mockModules,
  }),
}));

describe("useBlitzMode", () => {
  let selectionStore: ReturnType<typeof useSelectionStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockModules.blitzMode = true;
    mockModules.blitzSpeed = "fast";
    mockModules.blitzDwellMs = undefined;
    selectionStore = useSelectionStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("initializes with empty state", () => {
    const { isProcessing, fabState } = useBlitzMode(selectionStore);

    expect(isProcessing.value).toBe(false);
    expect(fabState.value.visible).toBe(false);
  });

  it("handles batch actions and queue processing", async () => {
    vi.useFakeTimers();

    const { handleAction, fabState, isProcessing } =
      useBlitzMode(selectionStore, { throttleMs: 0 });

    selectionStore.selectAll(["A", "B"]);

    expect(fabState.value.visible).toBe(true);
    expect(fabState.value.actionHref).toContain("id=A");

    const mockEvent = { preventDefault: vi.fn() } as unknown as MouseEvent;
    handleAction(mockEvent);

    expect(isProcessing.value).toBe(true);
    expect(mockOpenInGame).toHaveBeenCalledWith("A");

    vi.advanceTimersByTime(150);

    expect(fabState.value.actionHref).toContain("id=B");
    expect(fabState.value.label).toContain("Open (2/2)");

    handleAction(mockEvent);
    expect(mockOpenInGame).toHaveBeenCalledWith("B");
    vi.advanceTimersByTime(150);

    expect(isProcessing.value).toBe(false);
    expect(mockInfo).toHaveBeenCalledWith("Batch sequence complete · 2 profiles");
  });

  describe("Blitz Mode", () => {
    it("executes blitz sequence correctly", () => {
      vi.useFakeTimers();
      const throttleMs = 1000;
      const { handleBlitz, fabState } = useBlitzMode(selectionStore, { throttleMs });

      selectionStore.selectAll(["R1", "R2", "R3"]);

      handleBlitz();

      expect(fabState.value.activity).toMatchObject({
        label: "Blitz",
        exclusive: true,
      });
      expect(mockOpenInGame).toHaveBeenCalledWith("R1");
      expect(fabState.value.label).toBe("1 / 3");

      vi.advanceTimersByTime(4000);
      expect(mockOpenInGame).toHaveBeenCalledWith("R2");
      expect(fabState.value.label).toBe("2 / 3");

      vi.advanceTimersByTime(4000);
      expect(mockOpenInGame).toHaveBeenCalledWith("R3");
      expect(fabState.value.label).toBe("3 / 3");

      vi.advanceTimersByTime(1500);
      expect(fabState.value.activity).toBeUndefined();
      expect(mockInfo).toHaveBeenCalledWith("Blitz sequence complete · 3 profiles");
    });

    it("stops blitz when clearSelection is called", () => {
      vi.useFakeTimers();
      const { handleBlitz, clearSelection, fabState } = useBlitzMode(selectionStore);

      selectionStore.selectAll(["R1", "R2"]);
      handleBlitz();
      expect(fabState.value.activity?.label).toBe("Blitz");

      clearSelection();
      expect(fabState.value.activity).toBeUndefined();
      expect(selectionStore.selectedIds.value).toEqual([]);
    });
    it("keeps blitz disabled via AndroidBridge when blitzMode module is off", () => {
      mockModules.blitzMode = false;
      // Simulate native wrapper: inject the bridge before creating the composable
      const mockStartBlitz = vi.fn();
      (window as WindowWithBridge).AndroidBridge = {
        startBlitz: mockStartBlitz,
        isAndroidWrapper: () => true,
      } as AndroidBridge;

      const { isBlitzEnabled, handleBlitz } = useBlitzMode(selectionStore);
      selectionStore.selectAll(["R1", "R2"]);

      expect(isBlitzEnabled.value).toBe(false);

      handleBlitz();
      expect(mockStartBlitz).not.toHaveBeenCalled();
      expect(mockError).toHaveBeenCalledWith("Blitz Mode is disabled");

      // Clean up bridge injection
      delete (window as WindowWithBridge).AndroidBridge;
    });

    it("delegates startBlitz to AndroidBridge when available", () => {
      const mockStartBlitz = vi.fn();
      (window as WindowWithBridge).AndroidBridge = { startBlitz: mockStartBlitz } as AndroidBridge;

      const { handleBlitz } = useBlitzMode(selectionStore);
      selectionStore.selectAll(["R1", "R2"]);
      handleBlitz();

      // Bridge must receive the JSON tag list and the configured speed delay
      expect(mockStartBlitz).toHaveBeenCalledWith(JSON.stringify(["R1", "R2"]), expect.any(Number));
      // Web-side openInGame must NOT be called (native handles it)
      expect(mockOpenInGame).not.toHaveBeenCalled();

      delete (window as WindowWithBridge).AndroidBridge;
    });

    it("opens profiles without inviting when sendInvites is false", () => {
      const mockStartBlitz = vi.fn();
      const mockOpenProfiles = vi.fn();
      (window as WindowWithBridge).AndroidBridge = {
        startBlitz: mockStartBlitz,
        openProfiles: mockOpenProfiles,
      } as unknown as AndroidBridge;

      const { handleBlitz, isBlitzEnabled } = useBlitzMode(selectionStore, { sendInvites: false });
      selectionStore.selectAll(["M1", "M2"]);
      expect(isBlitzEnabled.value).toBe(true);
      handleBlitz();

      expect(mockOpenProfiles).toHaveBeenCalledWith(JSON.stringify(["M1", "M2"]), expect.any(Number));
      expect(mockStartBlitz).not.toHaveBeenCalled();

      delete (window as WindowWithBridge).AndroidBridge;
    });

    it("withholds a profiles-only Blitz from a shell that can only invite", () => {
      const mockStartBlitz = vi.fn();
      (window as WindowWithBridge).AndroidBridge = { startBlitz: mockStartBlitz } as AndroidBridge;

      const { handleBlitz, isBlitzEnabled, fabState } = useBlitzMode(selectionStore, { sendInvites: false });
      selectionStore.selectAll(["M1", "M2"]);

      expect(isBlitzEnabled.value).toBe(false);
      // The FAB falls back to opening one profile per tap.
      expect(fabState.value.actions.map((action) => action.label)).toEqual(["Open (1/2)"]);
      handleBlitz();
      expect(mockStartBlitz).not.toHaveBeenCalled();

      delete (window as WindowWithBridge).AndroidBridge;
    });

    it("renders FAB state correctly when selection mode is active with zero selected items", () => {
      selectionStore.setForceSelectionMode(true);
      selectionStore.selectedIds.value = [];

      const { fabState } = useBlitzMode(selectionStore);

      expect(fabState.value.visible).toBe(true);
      expect(fabState.value.label).toBe("Select");
      expect(fabState.value.actionHref).toBeUndefined();
      expect(fabState.value.selectionCount).toBe(0);
    });

    it("uses modules.blitzDwellMs as default throttleMs when options.throttleMs is omitted", () => {
      mockModules.blitzDwellMs = 1500;
      const { handleBlitz } = useBlitzMode(selectionStore);

      selectionStore.selectAll(["R1"]);

      const mockStartBlitz = vi.fn();
      (window as WindowWithBridge).AndroidBridge = { startBlitz: mockStartBlitz } as AndroidBridge;

      handleBlitz();

      expect(mockStartBlitz).toHaveBeenCalledWith(JSON.stringify(["R1"]), 1500);

      delete (window as WindowWithBridge).AndroidBridge;
      mockModules.blitzDwellMs = undefined;
    });

    it("supports manual advancement via handleAction during active blitz sequence", () => {
      vi.useFakeTimers();
      const throttleMs = 2000;
      const { handleBlitz, handleAction, fabState } = useBlitzMode(selectionStore, { throttleMs });

      selectionStore.selectAll(["R1", "R2", "R3"]);

      handleBlitz();
      expect(fabState.value.label).toBe("1 / 3");
      expect(mockOpenInGame).toHaveBeenNthCalledWith(1, "R1");

      // Advance past index 0 so that an automated timer is active for index 1 ("R2")
      vi.advanceTimersByTime(4000);
      expect(mockOpenInGame).toHaveBeenNthCalledWith(2, "R2");
      expect(fabState.value.label).toBe("2 / 3");

      const mockEvent = { preventDefault: vi.fn() } as unknown as MouseEvent;
      // Trigger manual action during active blitz (at index 1)
      handleAction(mockEvent);

      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(mockOpenInGame).toHaveBeenNthCalledWith(3, "R2");
      expect(fabState.value.label).toBe("3 / 3");

      // Advance timers by BLITZ_RECOVERY_DELAY / BLITZ_SAFETY_DELAY to trigger the reset timer for index 2 ("R3")
      vi.advanceTimersByTime(4000);
      expect(mockOpenInGame).toHaveBeenNthCalledWith(4, "R3");
    });

    it("throttles rapid handleAction clicks when not blasting", () => {
      vi.useFakeTimers();
      const throttleMs = 1000;
      const { handleAction } = useBlitzMode(selectionStore, { throttleMs });

      selectionStore.selectAll(["A", "B"]);
      const mockEvent = { preventDefault: vi.fn() } as unknown as MouseEvent;

      handleAction(mockEvent);
      expect(mockOpenInGame).toHaveBeenCalledTimes(1);
      expect(mockOpenInGame).toHaveBeenCalledWith("A");

      // Rapid click within throttleMs
      handleAction(mockEvent);
      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(mockOpenInGame).toHaveBeenCalledTimes(1); // Throttled!
    });

    it("skips undefined/falsy items gracefully during blitz sequence", () => {
      vi.useFakeTimers();
      const throttleMs = 500;
      const { handleBlitz, fabState } = useBlitzMode(selectionStore, { throttleMs });

      // Simulate selection array containing a falsy item
      selectionStore.selectAll(["R1", "", "R3"]);

      handleBlitz();
      expect(mockOpenInGame).toHaveBeenNthCalledWith(1, "R1");

      // Advance by BLITZ_SAFETY_DELAY (4000ms), which reaches index 1 (""), skips it, and calls "R3" synchronously
      vi.advanceTimersByTime(4000);
      expect(mockOpenInGame).toHaveBeenNthCalledWith(2, "R3");

      vi.advanceTimersByTime(2000);
      expect(fabState.value.activity).toBeUndefined();
    });

    it("dispatches fab commands correctly via handleFabCommand", () => {
      vi.useFakeTimers();
      const { handleFabCommand, fabState } = useBlitzMode(selectionStore, { throttleMs: 1000 });
      selectionStore.selectAll(["R1", "R2"]);

      const mockEvent = { preventDefault: vi.fn() } as unknown as MouseEvent;

      // START_BATCH_COMMAND triggers Blitz
      handleFabCommand("start-batch", mockEvent);
      expect(fabState.value.activity?.label).toBe("Blitz");
      expect(mockOpenInGame).toHaveBeenCalledWith("R1");
      expect(fabState.value.label).toBe("1 / 2");

      // Unrecognized command ID is ignored without throwing
      expect(() => handleFabCommand("unknown-command", mockEvent)).not.toThrow();
    });

    it("dispatches OPEN_PROFILE_COMMAND via handleFabCommand when not in blitz active mode", () => {
      vi.useFakeTimers();
      const { handleFabCommand, isProcessing } = useBlitzMode(selectionStore, { throttleMs: 0 });
      selectionStore.selectAll(["P1", "P2"]);

      const mockEvent = { preventDefault: vi.fn() } as unknown as MouseEvent;

      handleFabCommand("open-profile", mockEvent);
      expect(isProcessing.value).toBe(true);
      expect(mockOpenInGame).toHaveBeenCalledWith("P1");
    });
  });
});
