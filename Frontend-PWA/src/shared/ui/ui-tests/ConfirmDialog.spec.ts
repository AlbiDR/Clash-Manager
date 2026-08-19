// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { useConfirm } from "@core";
import ConfirmDialog from "../ConfirmDialog.vue";

describe("ConfirmDialog.vue", () => {
  const { active, confirm, resolve } = useConfirm();

  beforeEach(() => {
    active.value = null;
  });

  it("does not render dialog overlay when active state is null", () => {
    const wrapper = mount(ConfirmDialog, {
      global: {
        stubs: {
          teleport: true,
          transition: false,
        },
      },
    });

    expect(wrapper.find(".confirm-overlay").exists()).toBe(false);
  });

  it("renders dialog with active options when confirm is active", () => {
    confirm({
      title: "Delete Account?",
      message: "Are you sure? This cannot be undone.",
      confirmLabel: "Yes, Delete",
      cancelLabel: "Keep Account",
    });

    const wrapper = mount(ConfirmDialog, {
      global: {
        stubs: {
          teleport: true,
          transition: false,
        },
      },
    });

    expect(wrapper.find(".confirm-overlay").exists()).toBe(true);
    expect(wrapper.find("h3").text()).toBe("Delete Account?");
    expect(wrapper.find(".confirm-message").text()).toBe("Are you sure? This cannot be undone.");
    expect(wrapper.find(".cancel-btn").text()).toBe("Keep Account");
    expect(wrapper.find(".accept-btn").text()).toBe("Yes, Delete");
  });

  it("omits message element if message is not provided", () => {
    confirm({ title: "Quick Action" });

    const wrapper = mount(ConfirmDialog, {
      global: {
        stubs: {
          teleport: true,
          transition: false,
        },
      },
    });

    expect(wrapper.find(".confirm-message").exists()).toBe(false);
  });

  it("applies danger class to accept button when tone is 'danger'", () => {
    confirm({
      title: "Purge Database",
      tone: "danger",
    });

    const wrapper = mount(ConfirmDialog, {
      global: {
        stubs: {
          teleport: true,
          transition: false,
        },
      },
    });

    const acceptBtn = wrapper.find(".accept-btn");
    expect(acceptBtn.classes()).toContain("danger");
  });

  it("does not apply danger class when tone is 'default'", () => {
    confirm({
      title: "Save File",
      tone: "default",
    });

    const wrapper = mount(ConfirmDialog, {
      global: {
        stubs: {
          teleport: true,
          transition: false,
        },
      },
    });

    const acceptBtn = wrapper.find(".accept-btn");
    expect(acceptBtn.classes()).not.toContain("danger");
  });

  it("resolves with false when cancel button is clicked", async () => {
    const promise = confirm({ title: "Cancel Action Test" });

    const wrapper = mount(ConfirmDialog, {
      global: {
        stubs: {
          teleport: true,
          transition: false,
        },
      },
    });

    await wrapper.find(".cancel-btn").trigger("click");
    const result = await promise;

    expect(result).toBe(false);
    expect(active.value).toBeNull();
  });

  it("resolves with true when accept button is clicked", async () => {
    const promise = confirm({ title: "Accept Action Test" });

    const wrapper = mount(ConfirmDialog, {
      global: {
        stubs: {
          teleport: true,
          transition: false,
        },
      },
    });

    await wrapper.find(".accept-btn").trigger("click");
    const result = await promise;

    expect(result).toBe(true);
    expect(active.value).toBeNull();
  });

  it("resolves with false when clicking directly on overlay background", async () => {
    const promise = confirm({ title: "Backdrop Click Test" });

    const wrapper = mount(ConfirmDialog, {
      global: {
        stubs: {
          teleport: true,
          transition: false,
        },
      },
    });

    await wrapper.find(".confirm-overlay").trigger("click");
    const result = await promise;

    expect(result).toBe(false);
    expect(active.value).toBeNull();
  });
});
