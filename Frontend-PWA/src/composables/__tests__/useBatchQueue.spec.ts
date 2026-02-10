import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useBatchQueue } from "@core";

const mockOpenInGame = vi.fn();
const mockInfo = vi.fn();
const mockError = vi.fn();

vi.mock("../useExternalLink", () => ({
  useExternalLink: () => ({
    openInGame: mockOpenInGame,
  }),
  buildDeepLink: (id: string) => `id=${id}`,
}));

vi.mock("../useToast", () => ({
  useToast: () => ({
    info: mockInfo,
    error: mockError,
  }),
}));

vi.mock("../useAppSettings", () => ({
  useAppSettings: () => ({
    modules: { blitzMode: true },
  }),
}));

describe("useBatchQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("initializes with empty state", () => {
    const { selectedIds, queue, isSelectionMode, isProcessing } =
      useBatchQueue();

    expect(selectedIds.value).toEqual([]);
    expect(queue.value).toEqual([]);
    expect(isSelectionMode.value).toBe(false);
    expect(isProcessing.value).toBe(false);
  });

  it("toggles selection correctly", () => {
    const { selectedIds, toggleSelect, isSelectionMode } = useBatchQueue();

    // Select
    toggleSelect("123");
    expect(selectedIds.value).toContain("123");
    expect(isSelectionMode.value).toBe(true);

    // Select another
    toggleSelect("456");
    expect(selectedIds.value).toEqual(["123", "456"]);

    // Deselect
    toggleSelect("123");
    expect(selectedIds.value).toEqual(["456"]);
  });

  it("selects all items", () => {
    const { selectedIds, selectAll } = useBatchQueue();
    const items = ["1", "2", "3"];

    selectAll(items);
    expect(selectedIds.value).toEqual(["1", "2", "3"]);
  });

  it("clears selection", () => {
    const { selectedIds, clearSelection, selectAll } = useBatchQueue();

    selectAll(["1", "2"]);
    clearSelection();
    expect(selectedIds.value).toEqual([]);
  });

  it("handles batch actions and queue processing", async () => {
    vi.useFakeTimers();

    const { selectedIds, queue, handleAction, fabState, isProcessing } =
      useBatchQueue({ throttleMs: 0 });

    selectedIds.value = ["A", "B"];

    expect(fabState.value.visible).toBe(true);
    expect(fabState.value.actionHref).toContain("id=A");

    const mockEvent = { preventDefault: vi.fn() } as unknown as MouseEvent;
    handleAction(mockEvent);

    expect(queue.value).toEqual(["A", "B"]);
    expect(isProcessing.value).toBe(true);
    expect(mockOpenInGame).toHaveBeenCalledWith("A");

    vi.advanceTimersByTime(150);

    expect(queue.value).toEqual(["B"]);
    expect(fabState.value.actionHref).toContain("id=B");
    expect(fabState.value.label).toContain("Open (2/2)");

    handleAction(mockEvent);
    expect(mockOpenInGame).toHaveBeenCalledWith("B");
    vi.advanceTimersByTime(150);

    expect(queue.value).toEqual([]);
    expect(selectedIds.value).toEqual(["A", "B"]);
    expect(isProcessing.value).toBe(false);
    expect(mockInfo).toHaveBeenCalledWith("Batch complete");
  });

  describe("Blitz Mode", () => {
    it("executes blitz sequence correctly", () => {
      vi.useFakeTimers();
      const throttleMs = 1000;
      const { selectedIds, handleBlitz, fabState } = useBatchQueue({ throttleMs });

      selectedIds.value = ["R1", "R2", "R3"];

      handleBlitz();

      expect(fabState.value.isBlasting).toBe(true);
      expect(mockOpenInGame).toHaveBeenCalledWith("R1");
      expect(fabState.value.label).toBe("1 / 3");

      // Advance to next item. useBatchQueue uses Math.max(throttleMs, 4000) for blitz delay
      vi.advanceTimersByTime(4000);
      expect(mockOpenInGame).toHaveBeenCalledWith("R2");
      expect(fabState.value.label).toBe("2 / 3");

      vi.advanceTimersByTime(4000);
      expect(mockOpenInGame).toHaveBeenCalledWith("R3");
      expect(fabState.value.label).toBe("3 / 3");

      // Final completion delay (1500ms in useBatchQueue)
      vi.advanceTimersByTime(1500);
      expect(fabState.value.isBlasting).toBe(false);
      expect(mockInfo).toHaveBeenCalledWith("Blitz complete");
    });

    it("stops blitz when clearSelection is called", () => {
      vi.useFakeTimers();
      const { selectedIds, handleBlitz, clearSelection, fabState } = useBatchQueue();

      selectedIds.value = ["R1", "R2"];
      handleBlitz();
      expect(fabState.value.isBlasting).toBe(true);

      clearSelection();
      expect(fabState.value.isBlasting).toBe(false);
      expect(selectedIds.value).toEqual([]);
    });

    it("skips invalid IDs during blitz", () => {
      vi.useFakeTimers();
      const { selectedIds, handleBlitz, fabState } = useBatchQueue();

      // @ts-ignore - testing runtime resilience
      selectedIds.value = ["R1", null, "R3"];

      handleBlitz();
      expect(mockOpenInGame).toHaveBeenCalledWith("R1");

      vi.advanceTimersByTime(4000);
      // R2 is null, should skip to R3
      expect(mockOpenInGame).toHaveBeenCalledWith("R3");
      expect(mockOpenInGame).toHaveBeenCalledTimes(2);
    });
  });
});
