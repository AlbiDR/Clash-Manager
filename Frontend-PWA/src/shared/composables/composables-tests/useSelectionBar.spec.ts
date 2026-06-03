// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useSelectionBar } from "../useSelectionBar";
import { ref, reactive } from "vue";

// Mocking @core dependencies
const mockTap = vi.fn();
const mockMedium = vi.fn();
const mockHeavy = vi.fn();

vi.mock("@core", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    useHaptics: () => ({
      tap: mockTap,
      medium: mockMedium,
      heavy: mockHeavy,
    }),
    DEFAULT_SCORE_THRESHOLD: 75,
    SCORE_SELECTION_STEPS: [15, 30, 45, 60, 75, 90, 100],
  };
});

describe("useSelectionBar", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("initializes with correct default state", () => {
    const props = { count: 0 };
    const emit = vi.fn();
    const { isScoreExpanded, filterMode, filterValue, isActive, thresholds } = useSelectionBar(props, emit);

    expect(isScoreExpanded.value).toBe(false);
    expect(filterMode.value).toBe("ge");
    expect(filterValue.value).toBe(75);
    expect(isActive.value).toBe(false);
    expect(thresholds).toEqual([15, 30, 45, 60, 75, 90, 100]);
  });

  it("updates isActive when count changes", () => {
    const props = reactive({ count: 0 });
    const emit = vi.fn();
    const { isActive } = useSelectionBar(props, emit);

    expect(isActive.value).toBe(false);
    props.count = 5;
    expect(isActive.value).toBe(true);
    props.count = 0;
    expect(isActive.value).toBe(false);
  });

  it("toggles mode and emits event", () => {
    const props = { count: 1 };
    const emit = vi.fn();
    const { toggleMode, filterMode, filterValue } = useSelectionBar(props, emit);

    toggleMode();
    expect(filterMode.value).toBe("le");
    expect(mockTap).toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith("select-score", filterValue.value, "le");

    toggleMode();
    expect(filterMode.value).toBe("ge");
    expect(emit).toHaveBeenCalledWith("select-score", filterValue.value, "ge");
  });

  it("selects value and emits event", () => {
    const props = { count: 1 };
    const emit = vi.fn();
    const { selectValue, filterValue, filterMode } = useSelectionBar(props, emit);

    selectValue(60);
    expect(filterValue.value).toBe(60);
    expect(mockMedium).toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith("select-score", 60, filterMode.value);

    // Redundant selection should not trigger emit or haptics
    vi.clearAllMocks();
    selectValue(60);
    expect(emit).not.toHaveBeenCalled();
    expect(mockMedium).not.toHaveBeenCalled();
  });

  it("toggles expand and attempts scroll", () => {
    const props = { count: 1 };
    const emit = vi.fn();
    const { toggleExpand, isScoreExpanded, valuePicker } = useSelectionBar(props, emit);

    // Mock valuePicker ref
    const mockScrollTo = vi.fn();
    valuePicker.value = {
      scrollTo: mockScrollTo,
      scrollWidth: 500
    } as unknown as HTMLElement;

    toggleExpand();
    expect(isScoreExpanded.value).toBe(true);
    expect(mockTap).toHaveBeenCalled();

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
    const props = { count: 1 };
    const emit = vi.fn();
    const { toggleExpand, isScoreExpanded, valuePicker } = useSelectionBar(props, emit);

    valuePicker.value = null;

    expect(() => {
      toggleExpand();
      vi.advanceTimersByTime(50);
    }).not.toThrow();

    expect(isScoreExpanded.value).toBe(true);
  });

  it("handles valuePicker without scrollTo method safely", () => {
    const props = { count: 1 };
    const emit = vi.fn();
    const { toggleExpand, valuePicker } = useSelectionBar(props, emit);

    valuePicker.value = {
      scrollWidth: 500
    } as unknown as HTMLElement;

    expect(() => {
      toggleExpand();
      vi.advanceTimersByTime(50);
    }).not.toThrow();
  });
});
