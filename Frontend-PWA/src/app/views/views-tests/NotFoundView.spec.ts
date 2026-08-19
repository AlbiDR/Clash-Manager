// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
/**
 * NotFoundView Integration Tests
 *
 * @remarks
 * **Architectural Context:**
 * - **Domain:** Layer 4 App (navigation orchestration)
 * - **Satisfaction:** ADR Section VII (test location contract) and ADR Section X
 *   (Layer 4 strategy: entry/exit contracts only).
 *
 * Covers the route-table contract that the catch-all record establishes and the
 * rendering guards that keep an attacker-influencable path inert.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { createRouter, createWebHashHistory, type Router } from "vue-router";
import { defineComponent, h } from "vue";
import NotFoundView from "../NotFoundView.vue";
import Icon from "@shared/ui/Icon.vue";
import { vTactile } from "@shared/directives/vTactile";

const RosterStub = defineComponent({ render: () => h("div", "roster") });

/**
 * Builds a router whose table mirrors the production shape: real records followed by a
 * terminal catch-all, so assertions exercise the same matcher the app ships.
 */
function createHarnessRouter(): Router {
  return createRouter({
    history: createWebHashHistory(),
    routes: [
      { path: "/", redirect: "/roster" },
      { path: "/roster", name: "roster", component: RosterStub },
      { path: "/:pathMatch(.*)*", name: "not-found", component: NotFoundView },
    ],
  });
}

async function mountAt(targetPath: string) {
  const router = createHarnessRouter();
  await router.push(targetPath);
  await router.isReady();

  const wrapper = mount(NotFoundView, {
    global: {
      plugins: [router],
      components: { Icon },
      directives: { tactile: vTactile },
    },
  });

  return { wrapper, router };
}

describe("NotFoundView.vue", () => {
  it("renders the 404 identity and a recovery affordance", async () => {
    const { wrapper } = await mountAt("/definitely-not-a-console");

    expect(wrapper.find(".nf-badge").text()).toContain("404");
    expect(wrapper.find(".nf-title").text()).toBe("This link has no console");
    expect(wrapper.find(".nf-action").attributes("href")).toContain("/roster");
  });

  it("exposes the panel as an alert bound to its own heading", async () => {
    const { wrapper } = await mountAt("/gone");
    const panel = wrapper.find(".nf-panel");

    expect(panel.attributes("role")).toBe("alert");
    expect(panel.attributes("aria-labelledby")).toBe("nf-title");
    expect(wrapper.find("#nf-title").exists()).toBe(true);
  });

  it("echoes the unmatched path back to the operator", async () => {
    const { wrapper } = await mountAt("/headhuntr");

    expect(wrapper.find(".nf-route-value").text()).toBe("/headhuntr");
  });

  it("truncates an overlong path so a hostile deep link cannot break the panel", async () => {
    // [THREAT:] share_target and the web+clash protocol handler both write external
    // input straight into the hash segment, so this value is attacker-influencable.
    const overlongPath = `/${"a".repeat(400)}`;
    const { wrapper } = await mountAt(overlongPath);

    const renderedPath = wrapper.find(".nf-route-value").text();
    expect(renderedPath.endsWith("...")).toBe(true);
    expect(renderedPath.length).toBeLessThanOrEqual(99);
  });

  it("escapes markup in the unmatched path rather than parsing it", async () => {
    const { wrapper } = await mountAt("/<img src=x onerror=alert(1)>");
    const pathNode = wrapper.find(".nf-route-value");

    expect(pathNode.element.querySelector("img")).toBeNull();
    expect(pathNode.text()).toContain("<img");
  });
});

describe("router catch-all contract", () => {
  it("resolves an unknown path to the not-found record instead of matching nothing", () => {
    const router = createHarnessRouter();
    const resolved = router.resolve("/no/such/console");

    expect(resolved.name).toBe("not-found");
    expect(resolved.matched).toHaveLength(1);
  });

  it("still resolves known consoles ahead of the catch-all", () => {
    const router = createHarnessRouter();

    expect(router.resolve("/roster").name).toBe("roster");
  });
});
