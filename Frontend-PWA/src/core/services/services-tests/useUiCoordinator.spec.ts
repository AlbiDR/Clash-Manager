// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, beforeEach, vi } from "vitest";
import { useUiCoordinator } from "../useUiCoordinator";

describe("useUiCoordinator", () => {
  beforeEach(() => {
    const { setFabVisible, updateFabState } = useUiCoordinator();
    setFabVisible(false);
    // Manual reset of the singleton state for clean tests
    updateFabState({
      label: "Open",
      actionHref: undefined,
      isProcessing: false,
      isBlasting: false,
      selectionCount: 0,
      blitzEnabled: false,
      onAction: undefined,
      onBlitz: undefined,
      onDismiss: undefined,
    });
    // @ts-ignore - reset internal callbacks to null
    const { fabState } = useUiCoordinator();
    fabState.onAction = null;
    fabState.onBlitz = null;
    fabState.onDismiss = null;
  });

  it("should have correct initial state", () => {
    const { isFabVisible, dockVisible, fabState } = useUiCoordinator();
    expect(isFabVisible.value).toBe(false);
    expect(dockVisible.value).toBe(true);
    expect(fabState.label).toBe("Open");
  });

  it("should update FAB visibility and dock visibility accordingly", () => {
    const { isFabVisible, dockVisible, setFabVisible } = useUiCoordinator();

    setFabVisible(true);
    expect(isFabVisible.value).toBe(true);
    expect(dockVisible.value).toBe(false);

    setFabVisible(false);
    expect(isFabVisible.value).toBe(false);
    expect(dockVisible.value).toBe(true);
  });

  it("should update fabState correctly", () => {
    const { fabState, updateFabState } = useUiCoordinator();
    const onAction = vi.fn();

    updateFabState({
      label: "Delete",
      selectionCount: 5,
      onAction
    });

    expect(fabState.label).toBe("Delete");
    expect(fabState.selectionCount).toBe(5);
    expect(fabState.onAction).toBe(onAction);
    // Unchanged values should remain
    expect(fabState.isProcessing).toBe(false);
  });

  it("should calculate toastOffset based on FAB visibility", () => {
    const { toastOffset, setFabVisible } = useUiCoordinator();

    setFabVisible(false);
    expect(toastOffset.value).toBe(110);

    setFabVisible(true);
    // fabOffset (24) + 80 = 104
    expect(toastOffset.value).toBe(104);
  });

  it("should maintain singleton state across different instances", () => {
    const instance1 = useUiCoordinator();
    const instance2 = useUiCoordinator();

    instance1.setFabVisible(true);
    expect(instance2.isFabVisible.value).toBe(true);

    instance2.updateFabState({ label: "Instance 2 Update" });
    expect(instance1.fabState.label).toBe("Instance 2 Update");
  });

  it("should calculate fabOffset correctly", () => {
    const { fabOffset } = useUiCoordinator();
    expect(fabOffset.value).toBe(24);
  });

  it("should write falsy-but-defined values instead of treating them as absent", () => {
    const { fabState, updateFabState } = useUiCoordinator();

    // Seed the singleton with the opposite of every value asserted below, so a
    // merge that silently skips falsy input cannot pass by coincidence.
    updateFabState({
      label: "Seeded",
      isProcessing: true,
      isBlasting: true,
      selectionCount: 7,
      blitzEnabled: true,
    });

    updateFabState({
      label: "",
      isProcessing: false,
      isBlasting: false,
      selectionCount: 0,
      blitzEnabled: false,
    });

    // A truthiness guard (`if (value)`) instead of an explicit undefined check
    // would leave all five of these at their seeded values.
    expect(fabState.label).toBe("");
    expect(fabState.isProcessing).toBe(false);
    expect(fabState.isBlasting).toBe(false);
    expect(fabState.selectionCount).toBe(0);
    expect(fabState.blitzEnabled).toBe(false);
  });

  it("should treat undefined as leave-untouched rather than reset", () => {
    const { fabState, updateFabState } = useUiCoordinator();

    updateFabState({ label: "Preserved", selectionCount: 12, dismissIcon: "back" });

    // Every contract key omitted here must survive the merge untouched.
    updateFabState({ isProcessing: true });

    expect(fabState.label).toBe("Preserved");
    expect(fabState.selectionCount).toBe(12);
    expect(fabState.dismissIcon).toBe("back");
    expect(fabState.isProcessing).toBe(true);

    // An explicitly-undefined key must behave identically to an omitted one.
    updateFabState({ label: undefined, selectionCount: undefined });

    expect(fabState.label).toBe("Preserved");
    expect(fabState.selectionCount).toBe(12);
  });

  it("should reject off-contract keys instead of grafting them onto the singleton", () => {
    const { fabState, updateFabState } = useUiCoordinator();

    // `visible` belongs to the producer type ConsoleFabState, not to the
    // coordinator singleton, and is the exact key ConsoleLayout deliberately
    // withholds. `injectedPayload` stands in for an arbitrary untyped key.
    // The cast simulates an untyped or dynamically-built caller reaching the
    // merge, which is the only way this input is still representable.
    const offContractUpdate = {
      label: "On contract",
      visible: true,
      injectedPayload: { escalated: true },
    } as unknown as Parameters<typeof updateFabState>[0];

    updateFabState(offContractUpdate);

    // The on-contract key still lands.
    expect(fabState.label).toBe("On contract");

    // The singleton's shape must be unchanged. `fabState` is module-level state
    // that never resets, so a single grafted key would persist for the whole
    // session.
    expect(Object.prototype.hasOwnProperty.call(fabState, "visible")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(fabState, "injectedPayload")).toBe(false);
  });

  it("should keep the singleton key set stable across repeated merges", () => {
    const { fabState, updateFabState } = useUiCoordinator();
    const keysBeforeMerge = Object.keys(fabState).sort();

    updateFabState({ label: "First" });
    updateFabState({ selectionCount: 3, isHarvesting: true });
    updateFabState({ activeHarvester: "global", harvestEnabled: true });

    expect(Object.keys(fabState).sort()).toEqual(keysBeforeMerge);
  });
});
