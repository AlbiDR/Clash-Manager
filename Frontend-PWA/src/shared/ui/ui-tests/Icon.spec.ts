// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
/**
* @vitest-environment jsdom
 */
import Icon from "../Icon.vue";

import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
describe("Icon.vue", () => {
  it("renders correctly with given name and size", () => {
    const wrapper = mount(Icon, {
      props: {
        name: "gear",
        size: "24",
      },
    });
    expect(wrapper.exists()).toBe(true);
    const props = wrapper.props() as { name: string; size?: number | string; filled?: boolean };
    expect(props.name).toBe("gear");
    expect(props.size).toBe("24");
  });
});
