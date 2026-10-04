// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
/**
* @vitest-environment jsdom
 */
import Icon from "../Icon.vue";

import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { NAV_ITEMS } from "@core";
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

  it("renders every navigation glyph with scale-stable paths", () => {
    for (const item of NAV_ITEMS) {
      const wrapper = mount(Icon, { props: { name: item.icon } });
      const paths = wrapper.findAll("path");

      expect(paths.length, `${item.icon} is missing from the registry`).toBeGreaterThan(0);
      paths.forEach((path) => {
        expect(path.attributes("vector-effect")).toBe("non-scaling-stroke");
      });
    }
  });

  it("sizes token-driven icons through CSS without invalid SVG attributes", () => {
    const wrapper = mount(Icon, {
      props: { name: "gear", size: "var(--sys-layout-dock-icon-size)" },
    });
    const svg = wrapper.get("svg");

    expect(svg.attributes("width")).toBeUndefined();
    expect(svg.attributes("height")).toBeUndefined();
    expect(svg.attributes("style")).toContain("width: var(--sys-layout-dock-icon-size)");
  });
});
