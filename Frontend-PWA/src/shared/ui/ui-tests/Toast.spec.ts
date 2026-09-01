// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import Toast from "../Toast.vue";
import Icon from "../Icon.vue";

describe("Toast.vue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const defaultProps = {
    id: "test-id",
    type: "info" as const,
    message: "Test Message",
  };

  it("renders the message correctly", () => {
    const wrapper = mount(Toast, {
      props: defaultProps,
    });
    expect(wrapper.text()).toContain("Test Message");
  });

  it("renders different icons based on type", () => {
    const types = [
      { type: "success" as const, icon: "check" },
      { type: "error" as const, icon: "warning" },
      { type: "info" as const, icon: "info" },
      { type: "undo" as const, icon: "undo" },
    ];

    types.forEach(({ type, icon }) => {
      const wrapper = mount(Toast, {
        props: { ...defaultProps, type },
      });
      const iconComponent = wrapper.findComponent(Icon);
      expect(iconComponent.props("name")).toBe(icon);
    });
  });

  it("emits dismiss event when close button is clicked", async () => {
    const wrapper = mount(Toast, {
      props: defaultProps,
    });
    const closeBtn = wrapper.find(".close-btn");
    await closeBtn.trigger("click");
    expect(wrapper.emitted("dismiss")).toBeTruthy();
    expect(wrapper.emitted("dismiss")![0]).toEqual(["test-id"]);
  });

  it("renders action button and emits action event when clicked", async () => {
    const wrapper = mount(Toast, {
      props: { ...defaultProps, actionLabel: "UNDO" },
    });
    const actionBtn = wrapper.find(".action-btn");
    expect(actionBtn.exists()).toBe(true);
    expect(actionBtn.text()).toBe("UNDO");

    await actionBtn.trigger("click");
    expect(wrapper.emitted("action")).toBeTruthy();
    expect(wrapper.emitted("action")![0]).toEqual(["test-id"]);
  });

  it("only emits action once even if clicked multiple times", async () => {
    const wrapper = mount(Toast, {
      props: { ...defaultProps, actionLabel: "UNDO" },
    });
    const actionBtn = wrapper.find(".action-btn");

    await actionBtn.trigger("click");
    await actionBtn.trigger("click");

    expect(wrapper.emitted("action")).toHaveLength(1);
  });

  it("triggers action when main container is clicked if actionLabel exists", async () => {
    const wrapper = mount(Toast, {
      props: { ...defaultProps, actionLabel: "UNDO" },
    });
    await wrapper.trigger("click");
    expect(wrapper.emitted("action")).toBeTruthy();
  });

  it("does not trigger action when main container is clicked if no actionLabel", async () => {
    const wrapper = mount(Toast, {
      props: defaultProps,
    });
    await wrapper.trigger("click");
    expect(wrapper.emitted("action")).toBeFalsy();
  });

  it("emits dismiss automatically after duration", () => {
    const wrapper = mount(Toast, {
      props: { ...defaultProps, duration: 3000 },
    });

    vi.advanceTimersByTime(2999);
    expect(wrapper.emitted("dismiss")).toBeFalsy();

    vi.advanceTimersByTime(1);
    expect(wrapper.emitted("dismiss")).toBeTruthy();
    expect(wrapper.emitted("dismiss")![0]).toEqual(["test-id"]);
  });

  it("pauses and resumes timer on mouse enter/leave", async () => {
    const wrapper = mount(Toast, {
      props: { ...defaultProps, duration: 3000 },
    });

    vi.advanceTimersByTime(1500);

    // Mouse enter: clear timer
    await wrapper.trigger("mouseenter");
    vi.advanceTimersByTime(2000); // Total 3500 passed
    expect(wrapper.emitted("dismiss")).toBeFalsy();

    // Mouse leave: restart timer
    await wrapper.trigger("mouseleave");
    vi.advanceTimersByTime(3000);
    expect(wrapper.emitted("dismiss")).toBeTruthy();
  });

  it("clears timer on unmount", () => {
    const spy = vi.spyOn(window, "clearTimeout");
    const wrapper = mount(Toast, {
      props: { ...defaultProps, duration: 3000 },
    });
    wrapper.unmount();
    expect(spy).toHaveBeenCalled();
  });

  describe("copyToClipboard functionality", () => {
    it("renders copy button only for error and info toast types", () => {
      const types = [
        { type: "error" as const, expected: true },
        { type: "info" as const, expected: true },
        { type: "success" as const, expected: false },
        { type: "undo" as const, expected: false },
      ];

      types.forEach(({ type, expected }) => {
        const wrapper = mount(Toast, {
          props: { ...defaultProps, type },
        });
        expect(wrapper.find(".copy-btn").exists()).toBe(expected);
      });
    });

    it("writes message to clipboard and updates icon state to check tick for 2000ms", async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
        },
      });

      const wrapper = mount(Toast, {
        props: { ...defaultProps, type: "error", message: "Error payload" },
      });

      const copyBtn = wrapper.find(".copy-btn");
      expect(copyBtn.findComponent(Icon).props("name")).toBe("copy");

      await copyBtn.trigger("click");
      expect(writeTextMock).toHaveBeenCalledWith("Error payload");

      await wrapper.vm.$nextTick();
      expect(copyBtn.findComponent(Icon).props("name")).toBe("check");

      vi.advanceTimersByTime(2000);
      await wrapper.vm.$nextTick();
      expect(copyBtn.findComponent(Icon).props("name")).toBe("copy");
    });

    it("pauses auto-dismiss timer when copy is triggered and resumes timer after tick duration", async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
        },
      });

      const wrapper = mount(Toast, {
        props: { ...defaultProps, type: "info", duration: 3000 },
      });

      vi.advanceTimersByTime(1000); // 1000ms elapsed out of 3000ms

      const copyBtn = wrapper.find(".copy-btn");
      await copyBtn.trigger("click"); // Clears timer and sets 2000ms tick delay

      vi.advanceTimersByTime(2500); // tick ended at 2000ms and started a fresh 3000ms timer; 500ms into it
      expect(wrapper.emitted("dismiss")).toBeFalsy();

      vi.advanceTimersByTime(2500); // 3000ms since that restart, so dismissal fires
      expect(wrapper.emitted("dismiss")).toBeTruthy();
    });

    it("handles clipboard failure gracefully without throwing", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const writeTextMock = vi.fn().mockRejectedValue(new Error("Clipboard denied"));
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
        },
      });

      const wrapper = mount(Toast, {
        props: { ...defaultProps, type: "error" },
      });

      const copyBtn = wrapper.find(".copy-btn");
      await copyBtn.trigger("click");

      expect(consoleSpy).toHaveBeenCalledWith("Failed to copy toast message:", expect.any(Error));
      consoleSpy.mockRestore();
    });

    it("prevents triggering container action when copy button is clicked on an actionable toast", async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
        },
      });

      const wrapper = mount(Toast, {
        props: { ...defaultProps, type: "info", actionLabel: "RETRY" },
      });

      const copyBtn = wrapper.find(".copy-btn");
      await copyBtn.trigger("click");

      expect(writeTextMock).toHaveBeenCalled();
      expect(wrapper.emitted("action")).toBeFalsy();
    });
  });
});
