// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { reactive } from "vue";
import type { ConsoleFabAction, ConsoleFabActivity } from "@core/types";
import SelectionFab from "../SelectionFab.vue";

const fabState = reactive({
  label: "Open",
  actionHref: undefined as string | undefined,
  isProcessing: false,
  selectionCount: 0,
  actions: [] as ConsoleFabAction[],
  activity: null as ConsoleFabActivity | null,
  dismissIcon: "close",
  dismissLabel: "Clear selection",
  onCommand: vi.fn(),
  onDismiss: vi.fn(),
  onCancelOperation: vi.fn(),
});

vi.mock("@core/services/useUiCoordinator", () => ({ useUiCoordinator: () => ({ fabState }) }));

describe("SelectionFab.vue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fabState.selectionCount = 0;
    fabState.actions = [];
    fabState.activity = null;
    fabState.dismissIcon = "close";
    fabState.dismissLabel = "Clear selection";
  });

  const mountFab = () => mount(SelectionFab, {
    global: {
      stubs: { Icon: true },
      directives: { tactile: { beforeMount() {} } },
    },
  });

  it("renders a truthful group and dismiss action", async () => {
    const wrapper = mountFab();
    const dismissButton = wrapper.get(".fab-btn.dismiss");
    expect(wrapper.get(".selection-fab").attributes("aria-label")).toBe("Selection actions");
    expect(dismissButton.text()).toContain("Clear");
    expect(dismissButton.classes()).not.toContain("compact");
    await dismissButton.trigger("click");
    expect(fabState.onDismiss).toHaveBeenCalledOnce();
  });

  it("uses feature-owned dismiss semantics for a selection", () => {
    fabState.selectionCount = 3;
    fabState.dismissLabel = "Dismiss selected recruits";
    const dismissButton = mountFab().get(".fab-btn.dismiss");
    expect(dismissButton.classes()).toContain("compact");
    expect(dismissButton.classes()).not.toContain("danger");
    expect(dismissButton.attributes("aria-label")).toBe("Dismiss selected recruits (3)");
  });

  it("renders and dispatches generic feature commands", async () => {
    fabState.actions = [{
      id: "start-operation",
      label: "Run",
      accessibleLabel: "Run for 5 selected",
      icon: "lightning",
      tone: "secondary",
      badge: 5,
      supportingLabel: "selected",
    }];
    const wrapper = mountFab();
    const actionButton = wrapper.get("button[aria-label='Run for 5 selected']");
    expect(actionButton.classes()).toContain("secondary");
    expect(actionButton.text()).toContain("Run");
    expect(wrapper.get(".action-badge").text()).toBe("5");
    expect(wrapper.get(".action-support").text()).toBe("selected");
    await actionButton.trigger("click");
    expect(fabState.onCommand).toHaveBeenCalledWith("start-operation", expect.any(MouseEvent));
  });

  it("renders an exclusive activity and cancellation semantics", async () => {
    fabState.activity = {
      label: "Batch operation",
      status: "2 / 5",
      cancelLabel: "Cancel batch operation",
      exclusive: true,
    };
    fabState.actions = [{
      id: "advance-operation",
      label: "Next",
      accessibleLabel: "Open next item",
      icon: "chevron_right",
      tone: "primary",
      compact: true,
    }];
    const wrapper = mountFab();
    expect(wrapper.get(".selection-fab").attributes("aria-label")).toBe("Batch operation controls");
    expect(wrapper.get(".activity-label").text()).toBe("2 / 5");
    expect(wrapper.get(".fab-btn.dismiss").attributes("aria-label")).toBe("Cancel batch operation");
    expect(wrapper.get("button[aria-label='Open next item']").classes()).toContain("compact");
    await wrapper.get(".fab-btn.dismiss").trigger("click");
    expect(fabState.onCancelOperation).toHaveBeenCalledOnce();
    expect(fabState.onDismiss).not.toHaveBeenCalled();
  });

  it("announces non-exclusive activity and exposes busy state", () => {
    fabState.activity = {
      label: "Data operation",
      status: "Regional operation in progress",
      cancelLabel: "Abort data operation",
      exclusive: false,
    };
    fabState.actions = [{
      id: "regional-operation",
      label: "Regional operation",
      icon: "globe",
      compact: true,
      busy: true,
    }];
    const wrapper = mountFab();
    const actionButton = wrapper.get("button[aria-label='Regional operation']");
    expect(wrapper.get("[role='status']").text()).toBe("Regional operation in progress");
    expect(actionButton.attributes("aria-busy")).toBe("true");
    expect(actionButton.attributes()).toHaveProperty("disabled");
    expect(actionButton.get(".spinner-small").exists()).toBe(true);
  });

  it("does not dispatch disabled commands", async () => {
    fabState.actions = [{ id: "unavailable", label: "Unavailable", icon: "check", disabled: true }];
    await mountFab().get("button[aria-label='Unavailable']").trigger("click");
    expect(fabState.onCommand).not.toHaveBeenCalled();
  });
});
