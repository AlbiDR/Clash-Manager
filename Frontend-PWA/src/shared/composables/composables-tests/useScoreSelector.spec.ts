// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useScoreSelector } from "../useScoreSelector";

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
    const props = { mode: "ge" as const, value: 75 };
    const emit = vi.fn();
    const { isScoreExpanded, thresholds } = useScoreSelector(props, emit);

    expect(isScoreExpanded.value).toBe(false);
    expect(thresholds).toEqual([15, 30, 45, 60, 75, 90, 100]);
  });

  it("toggles mode and emits event", () => {
    const props = { mode: "ge" as const, value: 75 };
    const emit = vi.fn();
    const { toggleMode } = useScoreSelector(props, emit);

    toggleMode();
    expect(emit).toHaveBeenCalledWith("update:mode", "le");
    expect(mockTap).toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith("select", 75, "le");

    emit.mockClear();
    const propsLe = { mode: "le" as const, value: 75 };
    const { toggleMode: toggleModeLe } = useScoreSelector(propsLe, emit);
    toggleModeLe();
    expect(emit).toHaveBeenCalledWith("update:mode", "ge");
    expect(emit).toHaveBeenCalledWith("select", 75, "ge");
  });

  it("selects value and emits event", () => {
    const props = { mode: "ge" as const, value: 75 };
    const emit = vi.fn();
    const { selectValue } = useScoreSelector(props, emit);

    selectValue(60);
    expect(emit).toHaveBeenCalledWith("update:value", 60);
    expect(mockMedium).toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith("select", 60, "ge");

    // Redundant selection should not trigger emit or haptics
    vi.clearAllMocks();
    selectValue(75);
    expect(emit).not.toHaveBeenCalled();
    expect(mockMedium).not.toHaveBeenCalled();
  });

  it("toggles expand and attempts scroll", () => {
    const props = { mode: "ge" as const, value: 75 };
    const emit = vi.fn();
    const { toggleExpand, isScoreExpanded, valuePicker } = useScoreSelector(props, emit);

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
    const props = { mode: "ge" as const, value: 75 };
    const emit = vi.fn();
    const { toggleExpand, isScoreExpanded, valuePicker } = useScoreSelector(props, emit);

    valuePicker.value = null;

    expect(() => {
      toggleExpand();
      vi.advanceTimersByTime(50);
    }).not.toThrow();

    expect(isScoreExpanded.value).toBe(true);
  });

  it("handles valuePicker without scrollTo method safely", () => {
    const props = { mode: "ge" as const, value: 75 };
    const emit = vi.fn();
    const { toggleExpand, valuePicker } = useScoreSelector(props, emit);

    valuePicker.value = {
      scrollWidth: 500
    } as unknown as HTMLElement;

    expect(() => {
      toggleExpand();
      vi.advanceTimersByTime(50);
    }).not.toThrow();
  });
});
