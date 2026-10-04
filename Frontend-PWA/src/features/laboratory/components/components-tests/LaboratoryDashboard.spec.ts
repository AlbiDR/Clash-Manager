// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { staticTokens } from "@core/theme/base";
import LaboratoryDashboard from "../LaboratoryDashboard.vue";

describe("LaboratoryDashboard.vue", () => {
  it("owns the shared loaded and skeleton dashboard geometry", () => {
    const wrapper = mount(LaboratoryDashboard, {
      slots: {
        sidebar: '<div class="sidebar-panel" />',
        default: '<div class="dashboard-result" />',
      },
    });

    expect(wrapper.find(".dashboard-grid").exists()).toBe(true);
    expect(wrapper.find(".dashboard-sidebar .sidebar-panel").exists()).toBe(true);
    expect(wrapper.find(".dashboard-result").exists()).toBe(true);
    expect(staticTokens).toContain("--sys-layout-two-panel-min-width");
  });
});
