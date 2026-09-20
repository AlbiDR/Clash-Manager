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

  it("renders the full Clash Royale brand mark through the shared primitive", () => {
    const wrapper = mount(Icon, {
      props: { name: "clash-royale" },
    });

    expect(wrapper.find("svg").attributes("viewBox")).toBe("11 10 26 29");
    const paths = wrapper.findAll<SVGPathElement>(".icon-path");

    expect(paths).toHaveLength(4);
    expect(paths[0].element.style.fill).not.toBe("");
    expect(paths[2].element.style.fill).not.toBe(paths[0].element.style.fill);
  });
});
