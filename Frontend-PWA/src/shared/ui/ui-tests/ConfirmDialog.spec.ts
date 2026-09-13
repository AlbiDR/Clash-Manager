// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { useConfirm } from "@core";
import ConfirmDialog from "../ConfirmDialog.vue";

describe("ConfirmDialog.vue", () => {
  const { active, confirm } = useConfirm();

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
  describe("keyboard and assistive-technology contract", () => {
    // This replaced window.confirm(), which dismisses on Escape, moves focus
    // into itself and hands focus back afterwards, all for free. None of that
    // survived the replacement, so the app asked a blocking question that a
    // keyboard could neither answer nor escape, and a screen reader was never
    // told a dialog had opened.

    // [THREAT:] `active` is a module singleton, so every dialog left mounted by
    // an earlier test still watches it and still takes focus when the next test
    // opens one. Without this teardown the focus assertion reads whichever
    // leaked instance happened to run its watcher last.
    const mounted: ReturnType<typeof mount>[] = [];

    afterEach(() => {
      while (mounted.length) mounted.pop()?.unmount();
    });

    /** Mounts the dialog with Teleport and Transition flattened. */
    function mountDialog() {
      const wrapper = mount(ConfirmDialog, {
        attachTo: document.body,
        global: { stubs: { teleport: true, transition: false } },
      });
      mounted.push(wrapper);
      return wrapper;
    }

    it("resolves false on Escape, never true", async () => {
      // [THREAT:] Dismissing a confirmation must never be read as confirming.
      // These dialogs guard Factory Reset and cache destruction.
      const promise = confirm({ title: "Escape Test" });
      const wrapper = mountDialog();

      await wrapper.find(".confirm-overlay").trigger("keydown", { key: "Escape" });

      expect(await promise).toBe(false);
      expect(active.value).toBeNull();
    });

    it("ignores keys that are not Escape", async () => {
      confirm({ title: "Other Key Test" });
      const wrapper = mountDialog();

      await wrapper.find(".confirm-overlay").trigger("keydown", { key: "a" });

      expect(active.value).not.toBeNull();
    });

    it("announces itself as a modal dialog named by its title", async () => {
      confirm({ title: "Reset everything?", message: "This cannot be undone." });
      const wrapper = mountDialog();
      await wrapper.vm.$nextTick();

      const card = wrapper.find(".confirm-card");
      expect(card.attributes("role")).toBe("dialog");
      expect(card.attributes("aria-modal")).toBe("true");
      expect(card.attributes("aria-labelledby")).toBe(wrapper.find("h3").attributes("id"));
      expect(card.attributes("aria-describedby")).toBe(wrapper.find(".confirm-message").attributes("id"));
    });

    it("references no description region when there is no message", async () => {
      confirm({ title: "Bare" });
      const wrapper = mountDialog();
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".confirm-card").attributes("aria-describedby")).toBeUndefined();
    });

    it("moves focus onto the dismissing action when it opens", async () => {
      // Cancel rather than confirm, so a stray Enter cannot destroy anything.
      confirm({ title: "Focus Test" });
      const wrapper = mountDialog();
      await wrapper.vm.$nextTick();
      await wrapper.vm.$nextTick();

      expect(document.activeElement).toBe(wrapper.find(".cancel-btn").element);
    });
  });
});
