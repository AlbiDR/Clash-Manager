// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
/**
 * LinkRow Unit Tests
 *
 * @remarks
 * **Architectural Context:**
 * - **Domain:** Layer 2 Shared (UI primitive)
 * - **Satisfaction:** ADR Section X (Layer 2 strategy: unit + shallow mount) and
 *   ADR Section V (A11y: 48px minimum touch footprint).
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import LinkRow from "../LinkRow.vue";
import Icon from "../Icon.vue";
import { vTactile } from "../../directives/vTactile";

function mountRow(props: Record<string, unknown>) {
  return mount(LinkRow, {
    props,
    global: {
      components: { Icon },
      directives: { tactile: vTactile },
    },
  });
}

describe("LinkRow.vue", () => {
  it("renders the label and description", () => {
    const wrapper = mountRow({ label: "Source Code", description: "Read the project" });

    expect(wrapper.find(".link-label").text()).toBe("Source Code");
    expect(wrapper.find(".link-desc").text()).toBe("Read the project");
  });

  it("omits the description node entirely when none is supplied", () => {
    const wrapper = mountRow({ label: "Bare" });

    expect(wrapper.find(".link-desc").exists()).toBe(false);
  });

  it("renders an Icon when only an icon name is supplied", () => {
    const wrapper = mountRow({ label: "Issues", icon: "warning" });

    expect(wrapper.findComponent(Icon).props("name")).toBe("warning");
    expect(wrapper.find(".link-logo").exists()).toBe(false);
  });

  it("prefers a remote logo over an icon and labels it for assistive tech", () => {
    const wrapper = mountRow({
      label: "RoyaleAPI",
      icon: "github",
      logo: "https://cdn.example.test/logo.png",
    });
    const logo = wrapper.find(".link-logo");

    expect(logo.exists()).toBe(true);
    expect(logo.attributes("alt")).toBe("RoyaleAPI");
    expect(logo.attributes("loading")).toBe("lazy");
    expect(wrapper.findComponent(Icon).exists()).toBe(false);
  });

  it("emits click when activated", async () => {
    const wrapper = mountRow({ label: "Go" });
    await wrapper.find("button").trigger("click");

    expect(wrapper.emitted("click")).toHaveLength(1);
  });

  it("suppresses the click contract while disabled", async () => {
    const wrapper = mountRow({ label: "Go", disabled: true });
    await wrapper.find("button").trigger("click");

    expect(wrapper.emitted("click")).toBeUndefined();
    expect(wrapper.find("button").classes()).toContain("disabled");
  });

  it("renders a button so external navigation stays brokered, never a bare href", () => {
    // [THREAT:] A raw <a href> would bypass useExternalLink and escape the native
    // Android wrapper's interception of outbound navigation.
    const wrapper = mountRow({ label: "Go" });

    expect(wrapper.element.tagName).toBe("BUTTON");
    expect(wrapper.attributes("href")).toBeUndefined();
  });
});
