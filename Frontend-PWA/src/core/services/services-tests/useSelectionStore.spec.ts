// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * @vitest-environment node
 *
 * No DOM in this file, so it skips jsdom entirely. Building a jsdom Window
 * costs ~410ms per test file and dominated the suite (80.6s of ~120s CPU,
 * against 8.1s of actual test execution). Adding anything here that touches
 * `document`, `window`, `localStorage` or mounts a component will fail loudly
 * and immediately - remove this docblock if that is intentional.
 */
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

  it("does not mutate external input array passed to selectAll", () => {
    const { selectedIds, selectAll } = useSelectionStore();
    const items = Object.freeze(["item-1", "item-2"]);

    selectAll(items);
    expect(selectedIds.value).toEqual(["item-1", "item-2"]);
    expect(selectedIds.value).not.toBe(items);
  });

  it("handles repeated toggling of identical id without duplicating entries", () => {
    const { selectedIds, toggleSelect } = useSelectionStore();

    toggleSelect("item-alpha");
    expect(selectedIds.value).toEqual(["item-alpha"]);
    toggleSelect("item-alpha");
    expect(selectedIds.value).toEqual([]);
    toggleSelect("item-alpha");
    expect(selectedIds.value).toEqual(["item-alpha"]);
  });

  it("resets isManualSelectionModeForced when clearSelection is called", () => {
    const { isSelectionMode, setForceSelectionMode, clearSelection, selectedIds } = useSelectionStore();

    setForceSelectionMode(true);
    expect(selectedIds.value).toEqual([]);
    expect(isSelectionMode.value).toBe(true);

    clearSelection();
    expect(isSelectionMode.value).toBe(false);
  });

  it("remains in selection mode if manual override is deactivated but items are still selected", () => {
    const { isSelectionMode, setForceSelectionMode, toggleSelect } = useSelectionStore();

    toggleSelect("active-item");
    setForceSelectionMode(true);
    expect(isSelectionMode.value).toBe(true);

    setForceSelectionMode(false);
    expect(isSelectionMode.value).toBe(true);
  });

  it("exits selection mode if items are cleared individually while manual override is false", () => {
    const { isSelectionMode, toggleSelect } = useSelectionStore();

    toggleSelect("item-1");
    expect(isSelectionMode.value).toBe(true);

    toggleSelect("item-1");
    expect(isSelectionMode.value).toBe(false);
  });

  it("preserves selection order when removing an intermediate element", () => {
    const { selectedIds, toggleSelect, selectAll } = useSelectionStore();

    selectAll(["a", "b", "c", "d"]);
    toggleSelect("b");
    expect(selectedIds.value).toEqual(["a", "c", "d"]);
  });

  it("supports multiple independent store instances without shared state leakage", () => {
    const storeA = useSelectionStore();
    const storeB = useSelectionStore();

    storeA.toggleSelect("entity-1");
    storeA.setForceSelectionMode(true);

    expect(storeA.selectedIds.value).toEqual(["entity-1"]);
    expect(storeA.isSelectionMode.value).toBe(true);

    expect(storeB.selectedIds.value).toEqual([]);
    expect(storeB.isSelectionMode.value).toBe(false);
  });
});
