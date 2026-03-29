// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import ToastContainer from "../ToastContainer.vue";
import Toast from "../Toast.vue";
import { ref } from "vue";

// Mocking @core services with deep imports to avoid barrel side effects
const mockToasts = ref([]);
const mockRemove = vi.fn();
const mockTriggerAction = vi.fn();
const mockToastOffset = ref(110);

vi.mock("../../../core/services/useToast", () => ({
  useToast: () => ({
    toasts: mockToasts,
    remove: mockRemove,
    triggerAction: mockTriggerAction,
  }),
}));

vi.mock("../../../core/services/useUiCoordinator", () => ({
  useUiCoordinator: () => ({
    toastOffset: mockToastOffset,
  }),
}));

// Component uses barrel import, so we mock it to return our controlled mocks
vi.mock("../../../core", () => ({
  useToast: () => ({
    toasts: mockToasts,
    remove: mockRemove,
    triggerAction: mockTriggerAction,
  }),
  useUiCoordinator: () => ({
    toastOffset: mockToastOffset,
  }),
}));

describe("ToastContainer.vue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockToasts.value = [];
    mockToastOffset.value = 110;
  });

  it("renders multiple toasts from the service", () => {
    mockToasts.value = [
      { id: "1", type: "success", message: "One" },
      { id: "2", type: "error", message: "Two" },
    ] as any;

    const wrapper = mount(ToastContainer, {
      global: {
        stubs: {
          Toast: true,
          TransitionGroup: true,
        },
      },
    });

    const toasts = wrapper.findAllComponents(Toast);
    expect(toasts).toHaveLength(2);
    expect(toasts[0].props("message")).toBe("One");
    expect(toasts[1].props("message")).toBe("Two");
  });

  it("applies dynamic transform based on toastOffset", () => {
    mockToastOffset.value = 150;
    const wrapper = mount(ToastContainer, {
      global: {
        stubs: {
          TransitionGroup: true,
        },
      },
    });

    const container = wrapper.find(".toast-container");
    expect(container.attributes("style")).toContain("transform: translate(-50%, calc(-150px));");
  });

  it("has correct accessibility attributes", () => {
    const wrapper = mount(ToastContainer, {
      global: {
        stubs: {
          TransitionGroup: true,
        },
      },
    });

    const container = wrapper.find(".toast-container");
    expect(container.attributes("role")).toBe("status");
    expect(container.attributes("aria-live")).toBe("polite");
    expect(container.attributes("aria-atomic")).toBe("false");
  });

  it("delegates dismiss event to useToast.remove", async () => {
    mockToasts.value = [{ id: "1", type: "success", message: "One" }] as any;
    const wrapper = mount(ToastContainer, {
      global: {
        stubs: {
          TransitionGroup: true,
        },
      },
    });

    const toast = wrapper.getComponent(Toast);
    await toast.vm.$emit("dismiss", "1");

    expect(mockRemove).toHaveBeenCalledWith("1");
  });

  it("delegates action event to useToast.triggerAction", async () => {
    mockToasts.value = [{ id: "1", type: "undo", message: "One" }] as any;
    const wrapper = mount(ToastContainer, {
      global: {
        stubs: {
          TransitionGroup: true,
        },
      },
    });

    const toast = wrapper.getComponent(Toast);
    await toast.vm.$emit("action", "1");

    expect(mockTriggerAction).toHaveBeenCalledWith("1");
  });
});
