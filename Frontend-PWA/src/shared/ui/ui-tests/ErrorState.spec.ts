// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import { afterEach, describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import ErrorState from "../ErrorState.vue";
import { CLIPBOARD_FEEDBACK_DURATION_MS } from "../../composables/useClipboard";

describe("ErrorState.vue", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("renders the error message", () => {
    const message = "Network Synchronization Failed";
    const wrapper = mount(ErrorState, {
      props: { message },
    });
    expect(wrapper.text()).toContain(message);
    expect(wrapper.text()).toContain("Couldn't load this view");
    expect(wrapper.text()).toContain("Try again");
  });

  it("names the affected console in the recovery heading", () => {
    const wrapper = mount(ErrorState, {
      props: { title: "Roster", message: "Network Synchronization Failed" },
    });

    expect(wrapper.find(".error-heading").text()).toBe("Couldn't load Roster");
  });

  it("emits retry event when button is clicked", async () => {
    const wrapper = mount(ErrorState, {
      props: { message: "Error" },
    });

    const button = wrapper.find("button");
    await button.trigger("click");

    expect(wrapper.emitted()).toHaveProperty("retry");
  });

  it("copies the complete reader-safe error detail", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const wrapper = mount(ErrorState, {
      props: { message: "System Anomaly Detected" },
    });

    await wrapper.find(".error-action--secondary").trigger("click");
    await Promise.resolve();

    expect(writeText).toHaveBeenCalledWith("System Anomaly Detected");
    expect(wrapper.text()).toContain("Copied");

    vi.advanceTimersByTime(CLIPBOARD_FEEDBACK_DURATION_MS);
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain("Copy details");
  });
});
