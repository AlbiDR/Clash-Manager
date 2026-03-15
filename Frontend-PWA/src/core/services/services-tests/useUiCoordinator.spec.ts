import { describe, it, expect, beforeEach } from "vitest";
import { useUiCoordinator } from "../useUiCoordinator";

describe("useUiCoordinator", () => {
  const {
    isFabVisible,
    fabState,
    dockVisible,
    fabOffset,
    toastOffset,
    setFabVisible,
    updateFabState
  } = useUiCoordinator();

  beforeEach(() => {
    // Reset global state
    setFabVisible(false);
    updateFabState({
      label: "Open",
      actionHref: undefined,
      isProcessing: false,
      isBlasting: false,
      selectionCount: 0,
      blitzEnabled: false,
      onAction: null,
      onBlitz: null,
      onDismiss: null,
    } as any);
  });

  it("should initialize with default values", () => {
    expect(isFabVisible.value).toBe(false);
    expect(dockVisible.value).toBe(true);
    expect(fabState.label).toBe("Open");
    expect(fabOffset.value).toBe(24);
    expect(toastOffset.value).toBe(110);
  });

  it("should update isFabVisible and dockVisible when setFabVisible is called", () => {
    setFabVisible(true);
    expect(isFabVisible.value).toBe(true);
    expect(dockVisible.value).toBe(false);

    setFabVisible(false);
    expect(isFabVisible.value).toBe(false);
    expect(dockVisible.value).toBe(true);
  });

  it("should update fabState correctly via updateFabState", () => {
    const onAction = () => {};
    updateFabState({
      label: "Confirm",
      selectionCount: 5,
      onAction,
    });

    expect(fabState.label).toBe("Confirm");
    expect(fabState.selectionCount).toBe(5);
    expect(fabState.onAction).toBe(onAction);

    // Check that other values remain same
    expect(fabState.isProcessing).toBe(false);
  });

  it("should calculate toastOffset correctly based on isFabVisible", () => {
    // When FAB is hidden
    setFabVisible(false);
    expect(toastOffset.value).toBe(110);

    // When FAB is visible (fabOffset 24 + 80 = 104)
    setFabVisible(true);
    expect(toastOffset.value).toBe(104);
  });

  it("should maintain singleton state across multiple calls to the composable", () => {
    const { isFabVisible: isFab1, setFabVisible: setFab1 } = useUiCoordinator();
    const { isFabVisible: isFab2 } = useUiCoordinator();

    expect(isFab1.value).toBe(isFab2.value);

    setFab1(true);
    expect(isFab2.value).toBe(true);
  });
});
