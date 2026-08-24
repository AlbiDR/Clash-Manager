// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ref } from "vue";
import { useScoreSelector } from "../useScoreSelector";



vi.mock("@core", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    SCORE_SELECTION_STEPS: [15, 30, 45, 60, 75, 90, 100],
  };
});

describe("useScoreSelector", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("initializes with correct default state", () => {
    const mode = ref<"ge" | "le">("ge");
    const value = ref(75);
    const emitSelect = vi.fn();
    const { isScoreExpanded, thresholds } = useScoreSelector(mode, value, emitSelect);

    expect(isScoreExpanded.value).toBe(false);
    expect(thresholds).toEqual([15, 30, 45, 60, 75, 90, 100]);
  });

  it("toggles mode and calls emitSelect", () => {
    const mode = ref<"ge" | "le">("ge");
    const value = ref(75);
    const emitSelect = vi.fn();
    const { toggleMode } = useScoreSelector(mode, value, emitSelect);

    toggleMode();
    expect(mode.value).toBe("le");
    expect(emitSelect).toHaveBeenCalledWith(75, "le");

    emitSelect.mockClear();
    const modeLe = ref<"ge" | "le">("le");
    const { toggleMode: toggleModeLe } = useScoreSelector(modeLe, value, emitSelect);
    toggleModeLe();
    expect(modeLe.value).toBe("ge");
    expect(emitSelect).toHaveBeenCalledWith(75, "ge");
  });

  it("selects value and calls emitSelect", () => {
    const mode = ref<"ge" | "le">("ge");
    const value = ref(75);
    const emitSelect = vi.fn();
    const { selectValue } = useScoreSelector(mode, value, emitSelect);

    selectValue(60);
    expect(value.value).toBe(60);
    expect(emitSelect).toHaveBeenCalledWith(60, "ge");

    // Redundant selection should not trigger emitSelect
    emitSelect.mockClear();
    selectValue(60);
    expect(emitSelect).not.toHaveBeenCalled();
  });

  it("toggles expand and attempts scroll", () => {
    const mode = ref<"ge" | "le">("ge");
    const value = ref(75);
    const emitSelect = vi.fn();
    const { toggleExpand, isScoreExpanded, valuePicker } = useScoreSelector(mode, value, emitSelect);

    // Mock valuePicker ref
    const mockScrollTo = vi.fn();
    valuePicker.value = {
      scrollTo: mockScrollTo,
      scrollWidth: 500
    } as unknown as HTMLElement;

    toggleExpand();
    expect(isScoreExpanded.value).toBe(true);

    // Scroll is deferred via setTimeout(..., 50)
    expect(mockScrollTo).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(mockScrollTo).toHaveBeenCalledWith({
      left: 500,
      behavior: "smooth"
    });

    toggleExpand();
    expect(isScoreExpanded.value).toBe(false);
  });

  it("handles toggleExpand without valuePicker ref safely", () => {
    const mode = ref<"ge" | "le">("ge");
    const value = ref(75);
    const emitSelect = vi.fn();
    const { toggleExpand, isScoreExpanded, valuePicker } = useScoreSelector(mode, value, emitSelect);

    valuePicker.value = null;

    expect(() => {
      toggleExpand();
      vi.advanceTimersByTime(50);
    }).not.toThrow();

    expect(isScoreExpanded.value).toBe(true);
  });

  it("handles valuePicker without scrollTo method safely", () => {
    const mode = ref<"ge" | "le">("ge");
    const value = ref(75);
    const emitSelect = vi.fn();
    const { toggleExpand, valuePicker } = useScoreSelector(mode, value, emitSelect);

    valuePicker.value = {
      scrollWidth: 500
    } as unknown as HTMLElement;

    expect(() => {
      toggleExpand();
      vi.advanceTimersByTime(50);
    }).not.toThrow();
  });
});
