// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ref, nextTick } from "vue";
import { useCountdown } from "../useCountdown";
import { mount } from "@vue/test-utils";

describe("useCountdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("initializes with formatted value", async () => {
    const target = ref(new Date("2026-06-01T12:00:05Z"));

    const TestComponent = {
      setup() {
        const countdown = useCountdown(target);
        return { countdown };
      },
      template: "<div>{{ countdown }}</div>"
    };

    const wrapper = mount(TestComponent);
    expect(wrapper.text()).toBe("00:00:05");
  });

  it("updates value every second", async () => {
    const target = ref(new Date("2026-06-01T12:00:05Z"));

    const TestComponent = {
      setup() {
        const countdown = useCountdown(target);
        return { countdown };
      },
      template: "<div>{{ countdown }}</div>"
    };

    const wrapper = mount(TestComponent);

    vi.advanceTimersByTime(1000);
    await nextTick();
    expect(wrapper.text()).toBe("00:00:04");

    vi.advanceTimersByTime(4000);
    await nextTick();
    expect(wrapper.text()).toBe("Ended");
  });

  it("reacts to targetDate changes", async () => {
    const target = ref(new Date("2026-06-01T12:00:05Z"));

    const TestComponent = {
      setup() {
        const countdown = useCountdown(target);
        return { countdown };
      },
      template: "<div>{{ countdown }}</div>"
    };

    const wrapper = mount(TestComponent);
    expect(wrapper.text()).toBe("00:00:05");

    target.value = new Date("2026-06-01T12:00:10Z");
    await nextTick();
    expect(wrapper.text()).toBe("00:00:10");
  });

  it("triggers onExpiry only once when reaching zero", async () => {
    const onExpiry = vi.fn();
    const target = ref(new Date("2026-06-01T12:00:02Z"));

    const TestComponent = {
      setup() {
        useCountdown(target, { onExpiry });
        return {};
      },
      template: "<div></div>"
    };

    mount(TestComponent);

    vi.advanceTimersByTime(1000);
    expect(onExpiry).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);
    expect(onExpiry).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1000);
    expect(onExpiry).toHaveBeenCalledTimes(1);
  });

  it("cleans up timer on unmount", () => {
    const clearIntervalSpy = vi.spyOn(global, "clearInterval");
    const target = ref(new Date("2026-06-01T12:00:05Z"));

    const TestComponent = {
      setup() {
        useCountdown(target);
        return {};
      },
      template: "<div></div>"
    };

    const wrapper = mount(TestComponent);
    wrapper.unmount();

    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });

  it("handles null targetDate gracefully", async () => {
    const target = ref<Date | null>(null);

    const TestComponent = {
      setup() {
        const countdown = useCountdown(target);
        return { countdown };
      },
      template: "<div>{{ countdown }}</div>"
    };

    const wrapper = mount(TestComponent);
    expect(wrapper.text()).toBe("");

    target.value = new Date("2026-06-01T12:00:05Z");
    await nextTick();
    expect(wrapper.text()).toBe("00:00:05");
  });

  it("respects showDays option", async () => {
    // 25 hours ahead
    const target = ref(new Date("2026-06-02T13:00:00Z"));

    const TestComponent = {
      setup() {
        const countdown = useCountdown(target, { showDays: true });
        return { countdown };
      },
      template: "<div>{{ countdown }}</div>"
    };

    const wrapper = mount(TestComponent);
    // formatCountdown(future, { showDays: true }) for 1d 1h = "1d 01h" (based on formatters.spec.ts)
    expect(wrapper.text()).toBe("1d 01h");
  });
});
