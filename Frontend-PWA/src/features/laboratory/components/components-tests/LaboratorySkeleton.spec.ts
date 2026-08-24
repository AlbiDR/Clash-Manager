// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import LaboratorySkeleton from "../LaboratorySkeleton.vue";

describe("LaboratorySkeleton.vue", () => {
  it("renders correctly with all skeleton panels", () => {
    const wrapper = mount(LaboratorySkeleton);

    // Verify root class
    expect(wrapper.find(".laboratory-skeleton").exists()).toBe(true);

    // Verify main grid containers
    expect(wrapper.find(".dashboard-grid").exists()).toBe(true);
    expect(wrapper.find(".dashboard-sidebar").exists()).toBe(true);

    // Verify panels (Vault, Parameters, Summary)
    const panels = wrapper.findAll(".surface-panel");
    expect(panels.length).toBe(3);

    // Verify skeleton animation classes are present
    const animators = wrapper.findAll(".skeleton-anim");
    expect(animators.length).toBeGreaterThanOrEqual(4);
  });

  it("renders the trajectory list section", () => {
    const wrapper = mount(LaboratorySkeleton);
    expect(wrapper.find(".trajectory-section").exists()).toBe(true);
    expect(wrapper.find(".sk-trajectory-list").exists()).toBe(true);

    // Verify multiple trajectory items are rendered
    const items = wrapper.findAll(".sk-traj-item");
    expect(items.length).toBe(3);
  });
});
