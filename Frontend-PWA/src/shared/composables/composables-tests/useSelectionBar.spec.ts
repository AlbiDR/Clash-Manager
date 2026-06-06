// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach } from "vitest";
import { useSelectionBar } from "../useSelectionBar";
import { reactive } from "vue";

vi.mock("@core", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    DEFAULT_SCORE_THRESHOLD: 75,
  };
});

describe("useSelectionBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("initializes with correct default state", () => {
    const props = { count: 0 };
    const { filterMode, filterValue, isActive } = useSelectionBar(props);

    expect(filterMode.value).toBe("ge");
    expect(filterValue.value).toBe(75);
    expect(isActive.value).toBe(false);
  });

  it("updates isActive when count changes", () => {
    const props = reactive({ count: 0 });
    const { isActive } = useSelectionBar(props);

    expect(isActive.value).toBe(false);
    props.count = 5;
    expect(isActive.value).toBe(true);
    props.count = 0;
    expect(isActive.value).toBe(false);
  });
});
