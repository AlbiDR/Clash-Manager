// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import TagBadge from "../TagBadge.vue";

describe("TagBadge.vue", () => {
  it("truncates the player ID to 5 characters (plus '#' prefix)", () => {
    const wrapper = mount(TagBadge, {
      props: {
        id: "ABC123456"
      }
    });
    expect(wrapper.text()).toBe("#ABC12");
  });

  it("handles short tags without unexpected truncation", () => {
    const wrapper = mount(TagBadge, {
      props: {
        id: "AB"
      }
    });
    expect(wrapper.text()).toBe("#AB");
  });

  it("sets the correct aria-label for accessibility", () => {
    const id = "TAG99";
    const wrapper = mount(TagBadge, {
      props: { id }
    });
    expect(wrapper.attributes("aria-label")).toBe(`Player tag: #${id}`);
  });

  it("applies the tag class to the base badge", () => {
    const wrapper = mount(TagBadge, {
      props: { id: "TAG" }
    });
    expect(wrapper.classes()).toContain("tag");
  });
});
