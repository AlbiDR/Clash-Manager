// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";

describe("useStoragePersistence", () => {
  const mockPersisted = vi.fn();
  const mockPersist = vi.fn();
  let useStoragePersistence: any;

  beforeEach(async () => {
    vi.resetModules();
    vi.restoreAllMocks();

    // Default mock implementation
    mockPersisted.mockResolvedValue(false);
    mockPersist.mockResolvedValue(false);

    // Stub navigator.storage
    vi.stubGlobal("navigator", {
      storage: {
        persisted: mockPersisted,
        persist: mockPersist,
      },
    });

    // Dynamic import to get fresh singleton state
    const module = await import("../useStoragePersistence");
    useStoragePersistence = module.useStoragePersistence;
  });

  const getTestComponent = () => ({
    setup() {
      const persistence = useStoragePersistence();
      return { ...persistence };
    },
    template: "<div></div>",
  });

  it("initializes with supported status if navigator.storage exists", async () => {
    const wrapper = mount(getTestComponent());
    expect(wrapper.vm.isSupported).toBe(true);
  });

  it("updates isPersisted on mount", async () => {
    mockPersisted.mockResolvedValue(true);
    const wrapper = mount(getTestComponent());

    // Wait for onMounted and the async check()
    await nextTick();
    await new Promise(resolve => setTimeout(resolve, 0)); // wait for microtasks

    expect(mockPersisted).toHaveBeenCalled();
    expect(wrapper.vm.isPersisted).toBe(true);
  });

  it("requests persistence and updates state", async () => {
    const wrapper = mount(getTestComponent());
    mockPersist.mockResolvedValue(true);

    await wrapper.vm.requestPersistence();

    expect(mockPersist).toHaveBeenCalled();
    expect(wrapper.vm.isPersisted).toBe(true);
  });

  it("handles lack of navigator.storage gracefully", async () => {
    // Reset modules again after stubbing empty navigator
    vi.stubGlobal("navigator", {});
    vi.resetModules();
    const module = await import("../useStoragePersistence");
    useStoragePersistence = module.useStoragePersistence;

    const wrapper = mount(getTestComponent());

    expect(wrapper.vm.isSupported).toBe(false);
    expect(wrapper.vm.isPersisted).toBe(false);

    // Should not throw
    await wrapper.vm.requestPersistence();
    expect(wrapper.vm.isPersisted).toBe(false);
  });
});
