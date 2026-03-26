// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import RoleBadge from "../RoleBadge.vue";

describe("RoleBadge.vue", () => {
  const createWrapper = (props = {}) => {
    return mount(RoleBadge, {
      props: {
        role: "member",
        ...props
      }
    });
  };

  it("renders correctly with different roles", () => {
    const roles = [
      { input: "leader", expectedLabel: "Leader", expectedClass: "role-leader" },
      { input: "coLeader", expectedLabel: "Co-Lead", expectedClass: "role-coleader" },
      { input: "elder", expectedLabel: "Elder", expectedClass: "role-elder" },
      { input: "member", expectedLabel: "Member", expectedClass: "role-member" },
      { input: "unknown", expectedLabel: "Member", expectedClass: "role-member" },
    ];

    roles.forEach(({ input, expectedLabel, expectedClass }) => {
      const wrapper = createWrapper({ role: input });
      expect(wrapper.text()).toBe(expectedLabel);
      expect(wrapper.classes()).toContain(expectedClass);
    });
  });

  it("handles empty or undefined role", () => {
    const wrapper = createWrapper({ role: undefined as any });
    expect(wrapper.text()).toBe("Member");
    expect(wrapper.classes()).toContain("role-member");
  });
});
