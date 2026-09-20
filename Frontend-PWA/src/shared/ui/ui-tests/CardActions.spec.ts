// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
/**
 * @vitest-environment jsdom
 */
import CardActions from "../CardActions.vue";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { ROYALE_API_LOGO_URL } from "@core";

const mockOpenExternal = vi.fn();
const mockOpenInGame = vi.fn();
const mockTap = vi.fn();

vi.mock("@shared/composables/useHaptics", () => ({
  useHaptics: () => ({ tap: mockTap }),
}));

vi.mock("@core/services/useExternalLink", () => ({
  useExternalLink: () => ({
    openExternal: mockOpenExternal,
    openInGame: mockOpenInGame,
  }),
}));

describe("CardActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders action buttons when not loading", () => {
    const wrapper = mount(CardActions, {
      props: {
        id: "TAG123",
        loading: false,
      },
    });

    const buttons = wrapper.findAll("button");
    expect(buttons).toHaveLength(2);
    expect(buttons[0].text()).toContain("RoyaleAPI");
    expect(buttons[1].text()).toContain("Open Game");
    expect(buttons[0].attributes("aria-label")).toBe("View TAG123 on RoyaleAPI");
    expect(buttons[1].attributes("aria-label")).toBe("Open TAG123 in Clash Royale");
    expect(buttons[0].classes()).toContain("card-action--reference");
    expect(buttons[1].classes()).toContain("card-action--game");
    expect(wrapper.find(".royaleapi-logo").attributes("src")).toBe(ROYALE_API_LOGO_URL);
    expect(wrapper.findAllComponents({ name: "Icon" })[0].props("name")).toBe("clash-royale");
    expect(wrapper.find(".skeleton-anim").exists()).toBe(false);
  });

  it("renders skeletons when loading", () => {
    const wrapper = mount(CardActions, {
      props: {
        id: "TAG123",
        loading: true,
      },
    });

    expect(wrapper.findAll("button")).toHaveLength(0);
    expect(wrapper.findAll(".skeleton-anim")).toHaveLength(2);
  });

  it("calls openExternal when RoyaleAPI button is clicked", async () => {
    const wrapper = mount(CardActions, {
      props: {
        id: "TAG123",
        loading: false,
      },
    });

    await wrapper.findAll("button")[0].trigger("click");
    expect(mockOpenExternal).toHaveBeenCalledWith(
      "https://royaleapi.com/player/TAG123",
    );
  });

  it("calls openInGame when Open Game button is clicked", async () => {
    const wrapper = mount(CardActions, {
      props: {
        id: "TAG123",
        loading: false,
      },
    });

    await wrapper.findAll("button")[1].trigger("click");
    expect(mockOpenInGame).toHaveBeenCalledWith("TAG123");
  });

  it("applies compact class when compact prop is true", () => {
    const wrapper = mount(CardActions, {
      props: {
        id: "TAG123",
        compact: true,
      },
    });

    const buttons = wrapper.findAll("button");
    expect(buttons[0].classes()).toContain("compact");
    expect(buttons[1].classes()).toContain("compact");
  });
});
