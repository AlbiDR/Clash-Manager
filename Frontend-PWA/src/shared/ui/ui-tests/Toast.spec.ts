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

  it("renders a duration-aware progress rail for undo", () => {
    const wrapper = mount(Toast, {
      props: { ...defaultProps, type: "undo", duration: 7000 },
    });

    expect(wrapper.classes()).toContain("undo");
    expect(wrapper.attributes("style")).toContain("--toast-duration: 7000ms");
  });

  it("emits dismiss event when close button is clicked", async () => {
    const wrapper = mount(Toast, {
      props: defaultProps,
    });
    const closeBtn = wrapper.find(".close-btn");
    expect(closeBtn.attributes("type")).toBe("button");
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
    expect(actionBtn.attributes("type")).toBe("button");

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

  it("requests dismissal pause and resume on mouse enter and leave", async () => {
    const wrapper = mount(Toast, {
      props: { ...defaultProps, duration: 3000 },
    });

    await wrapper.trigger("mouseenter");
    await wrapper.trigger("mouseleave");

    expect(wrapper.emitted("pause-dismissal")).toEqual([["test-id"]]);
    expect(wrapper.emitted("resume-dismissal")).toEqual([["test-id"]]);
  });

  it("requests one pause while keyboard focus remains inside", async () => {
    const wrapper = mount(Toast, {
      props: { ...defaultProps, duration: 3000 },
    });

    await wrapper.trigger("focusin");
    await wrapper.trigger("focusin");

    await wrapper.trigger("focusout");

    expect(wrapper.emitted("pause-dismissal")).toEqual([["test-id"]]);
    expect(wrapper.emitted("resume-dismissal")).toEqual([["test-id"]]);
  });

  it("does not request resume until pointer and focus holds are both released", async () => {
    const wrapper = mount(Toast, {
      props: { ...defaultProps, duration: 3000 },
    });

    await wrapper.trigger("mouseenter");
    await wrapper.trigger("focusin");
    await wrapper.trigger("mouseleave");
    expect(wrapper.emitted("resume-dismissal")).toBeUndefined();

    await wrapper.trigger("focusout");
    expect(wrapper.emitted("pause-dismissal")).toEqual([["test-id"]]);
    expect(wrapper.emitted("resume-dismissal")).toEqual([["test-id"]]);
  });

  it("does not request an undo-window pause on hover", async () => {
    const wrapper = mount(Toast, {
      props: { ...defaultProps, type: "undo", duration: 3000 },
    });

    await wrapper.trigger("mouseenter");
    expect(wrapper.emitted("pause-dismissal")).toBeUndefined();
  });

  it("releases an active interaction hold on unmount", async () => {
    const wrapper = mount(Toast, {
      props: { ...defaultProps, duration: 3000 },
    });
    await wrapper.trigger("mouseenter");
    wrapper.unmount();

    expect(wrapper.emitted("resume-dismissal")).toEqual([["test-id"]]);
  });

  describe("copyToastMessage functionality", () => {
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
      expect(copyBtn.attributes("type")).toBe("button");
      expect(copyBtn.findComponent(Icon).props("name")).toBe("copy");

      await copyBtn.trigger("click");
      expect(writeTextMock).toHaveBeenCalledWith("Error payload");

      await wrapper.vm.$nextTick();
      expect(copyBtn.findComponent(Icon).props("name")).toBe("check");

      vi.advanceTimersByTime(2000);
      await wrapper.vm.$nextTick();
      expect(copyBtn.findComponent(Icon).props("name")).toBe("copy");
    });

    it("holds dismissal during copy feedback and releases it afterward", async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
        },
      });

      const wrapper = mount(Toast, {
        props: { ...defaultProps, type: "info", duration: 3000 },
      });

      const copyBtn = wrapper.find(".copy-btn");
      await copyBtn.trigger("click");

      expect(wrapper.emitted("pause-dismissal")).toEqual([["test-id"]]);
      expect(wrapper.emitted("resume-dismissal")).toBeUndefined();

      vi.advanceTimersByTime(2000);
      expect(wrapper.emitted("resume-dismissal")).toEqual([["test-id"]]);
    });

    it("communicates unavailable clipboard access without throwing", async () => {
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

      expect(copyBtn.attributes("aria-label")).toBe("Copy unavailable");
      expect(copyBtn.classes()).toContain("is-unavailable");
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
