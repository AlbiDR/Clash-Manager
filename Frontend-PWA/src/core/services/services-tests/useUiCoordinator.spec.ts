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
});
