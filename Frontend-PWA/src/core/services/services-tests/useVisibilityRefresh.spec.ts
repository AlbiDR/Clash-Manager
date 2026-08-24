// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, ref } from "vue";
import { useVisibilityRefresh } from "../useVisibilityRefresh";
import * as visibilityUtils from "../../utils/visibility";

vi.mock("../../utils/visibility", () => ({
  registerVisibilityRefresh: vi.fn(),
}));

describe("useVisibilityRefresh", () => {
  const TestComponent = defineComponent({
    props: ["refreshFn", "isRefreshing"],
    setup(props) {
      useVisibilityRefresh(props.refreshFn, props.isRefreshing);
      return {};
    },
    template: "<div></div>",
  });

  it("should register refresh logic on mount and cleanup on unmount", () => {
    const refreshFn = vi.fn();
    const cleanupFn = vi.fn();
    vi.mocked(visibilityUtils.registerVisibilityRefresh).mockReturnValue(cleanupFn);

    const wrapper = mount(TestComponent, {
      props: { refreshFn },
    });

    expect(visibilityUtils.registerVisibilityRefresh).toHaveBeenCalledWith(expect.any(Function));

    wrapper.unmount();
    expect(cleanupFn).toHaveBeenCalled();
  });

  it("should bypass refresh if isRefreshing guard is true", () => {
    const refreshFn = vi.fn();
    let internalCallback: (() => void) | undefined;

    vi.mocked(visibilityUtils.registerVisibilityRefresh).mockImplementation((cb) => {
      internalCallback = cb;
      return () => {};
    });

    mount(TestComponent, {
      props: {
        refreshFn,
        isRefreshing: ref(true)
      },
    });

    if (internalCallback) internalCallback();
    expect(refreshFn).not.toHaveBeenCalled();
  });

  it("should trigger refresh if isRefreshing guard is false", () => {
    const refreshFn = vi.fn();
    let internalCallback: (() => void) | undefined;

    vi.mocked(visibilityUtils.registerVisibilityRefresh).mockImplementation((cb) => {
      internalCallback = cb;
      return () => {};
    });

    mount(TestComponent, {
      props: {
        refreshFn,
        isRefreshing: ref(false)
      },
    });

    if (internalCallback) internalCallback();
    expect(refreshFn).toHaveBeenCalled();
  });
});
