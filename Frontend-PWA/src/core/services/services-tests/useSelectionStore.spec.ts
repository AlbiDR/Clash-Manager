// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import { useSelectionStore } from "../useSelectionStore";
import { describe, it, expect, beforeEach } from "vitest";

describe("useSelectionStore", () => {
  beforeEach(() => {
    // Reset any potential global state if needed
  });

  it("initializes with empty state", () => {
    const { selectedIds, isSelectionMode } = useSelectionStore();

    expect(selectedIds.value).toEqual([]);
    expect(isSelectionMode.value).toBe(false);
  });

  it("toggles selection correctly", () => {
    const { selectedIds, toggleSelect, isSelectionMode } = useSelectionStore();

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
    const { selectedIds, selectAll } = useSelectionStore();
    const items = ["1", "2", "3"];

    selectAll(items);
    expect(selectedIds.value).toEqual(["1", "2", "3"]);
  });

  it("clears selection", () => {
    const { selectedIds, clearSelection, selectAll } = useSelectionStore();

    selectAll(["1", "2"]);
    clearSelection();
    expect(selectedIds.value).toEqual([]);
  });

  it("forces selection mode", () => {
    const { isSelectionMode, setForceSelectionMode } = useSelectionStore();

    expect(isSelectionMode.value).toBe(false);
    setForceSelectionMode(true);
    expect(isSelectionMode.value).toBe(true);
  });
});
