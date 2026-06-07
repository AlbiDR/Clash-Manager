// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import { useBlitzMode } from "../useBlitzMode";
import { useSelectionStore } from "@core/services/useSelectionStore";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockOpenInGame = vi.fn();
const mockInfo = vi.fn();
const mockError = vi.fn();

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
    modules: { blitzMode: true },
  }),
}));

describe("useBlitzMode", () => {
  let selectionStore: ReturnType<typeof useSelectionStore>;

  beforeEach(() => {
    vi.clearAllMocks();
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
    expect(mockInfo).toHaveBeenCalledWith("Batch complete");
  });

  describe("Blitz Mode", () => {
    it("executes blitz sequence correctly", () => {
      vi.useFakeTimers();
      const throttleMs = 1000;
      const { handleBlitz, fabState } = useBlitzMode(selectionStore, { throttleMs });

      selectionStore.selectAll(["R1", "R2", "R3"]);

      handleBlitz();

      expect(fabState.value.isBlasting).toBe(true);
      expect(mockOpenInGame).toHaveBeenCalledWith("R1");
      expect(fabState.value.label).toBe("1 / 3");

      vi.advanceTimersByTime(4000);
      expect(mockOpenInGame).toHaveBeenCalledWith("R2");
      expect(fabState.value.label).toBe("2 / 3");

      vi.advanceTimersByTime(4000);
      expect(mockOpenInGame).toHaveBeenCalledWith("R3");
      expect(fabState.value.label).toBe("3 / 3");

      vi.advanceTimersByTime(1500);
      expect(fabState.value.isBlasting).toBe(false);
      expect(mockInfo).toHaveBeenCalledWith("Blitz complete");
    });

    it("stops blitz when clearSelection is called", () => {
      vi.useFakeTimers();
      const { handleBlitz, clearSelection, fabState } = useBlitzMode(selectionStore);

      selectionStore.selectAll(["R1", "R2"]);
      handleBlitz();
      expect(fabState.value.isBlasting).toBe(true);

      clearSelection();
      expect(fabState.value.isBlasting).toBe(false);
      expect(selectionStore.selectedIds.value).toEqual([]);
    });
    it("enables blitz via AndroidBridge even when blitzMode module is off", () => {
      // Simulate native wrapper: inject the bridge before creating the composable
      const mockStartBlitz = vi.fn();
      (window as any).AndroidBridge = { startBlitz: mockStartBlitz, isAndroidWrapper: () => true };

      const { fabState } = useBlitzMode(selectionStore);
      selectionStore.selectAll(["R1", "R2"]);

      // blitzEnabled must be true from the bridge, not from module setting
      expect(fabState.value.blitzEnabled).toBe(true);

      // Clean up bridge injection
      delete (window as any).AndroidBridge;
    });

    it("delegates startBlitz to AndroidBridge when available", () => {
      const mockStartBlitz = vi.fn();
      (window as any).AndroidBridge = { startBlitz: mockStartBlitz };

      const { handleBlitz } = useBlitzMode(selectionStore);
      selectionStore.selectAll(["R1", "R2"]);
      handleBlitz();

      // Bridge must receive the JSON tag list
      expect(mockStartBlitz).toHaveBeenCalledWith(JSON.stringify(["R1", "R2"]));
      // Web-side openInGame must NOT be called (native handles it)
      expect(mockOpenInGame).not.toHaveBeenCalled();

      delete (window as any).AndroidBridge;
    });
  });
});
