// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import HeaderInfoOverlay from "../HeaderInfoOverlay.vue";
import * as formatters from "../../../core/utils/formatters";
import Icon from "../Icon.vue";

vi.mock("../../../core/utils/formatters", () => ({
  formatHeaderDescription: vi.fn((text) => `formatted-${text}`),
}));

describe("HeaderInfoOverlay.vue", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.body.style.overflow = "";
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const defaultProps = {
    show: true,
    content: "Test Content",
    title: "Test Title",
  };

  const globalConfig = {
    components: {
      Icon,
    },
    // We do NOT stub Teleport here, as we want to test its effect on document.body
  };

  it("renders when show is true and content exists", async () => {
    mount(HeaderInfoOverlay, {
      props: defaultProps,
      global: globalConfig,
    });

    const overlay = document.body.querySelector(".info-overlay");
    expect(overlay).toBeTruthy();
    expect(overlay?.textContent).toContain("Test Title");
    expect(overlay?.querySelector(".expansion-content")?.innerHTML).toBe("formatted-Test Content");
    expect(formatters.formatHeaderDescription).toHaveBeenCalledWith("Test Content");
  });

  it("does not render when show is false", () => {
    mount(HeaderInfoOverlay, {
      props: { ...defaultProps, show: false },
      global: globalConfig,
    });

    const overlay = document.body.querySelector(".info-overlay");
    expect(overlay).toBeNull();
  });

  it("does not render when content is null", () => {
    mount(HeaderInfoOverlay, {
      props: { ...defaultProps, content: null },
      global: globalConfig,
    });

    const overlay = document.body.querySelector(".info-overlay");
    expect(overlay).toBeNull();
  });

  it("renders default title if none provided", () => {
    mount(HeaderInfoOverlay, {
      props: { ...defaultProps, title: undefined },
      global: globalConfig,
    });

    const title = document.body.querySelector("h3");
    expect(title?.textContent).toBe("Heuristic Analysis");
  });

  it("locks body overflow when shown", async () => {
    const wrapper = mount(HeaderInfoOverlay, {
      props: { ...defaultProps, show: false },
      global: globalConfig,
    });
    expect(document.body.style.overflow).toBe("");

    await wrapper.setProps({ show: true });
    expect(document.body.style.overflow).toBe("hidden");

    await wrapper.setProps({ show: false });
    expect(document.body.style.overflow).toBe("");
  });

  it("emits close when close button is clicked", async () => {
    const wrapper = mount(HeaderInfoOverlay, {
      props: defaultProps,
      global: globalConfig,
    });

    const closeBtn = document.body.querySelector(".close-btn-round") as HTMLButtonElement;
    expect(closeBtn).toBeTruthy();

    closeBtn.click();
    expect(wrapper.emitted("close")).toBeTruthy();
  });

  it("emits close when clicking outside the card", () => {
    const wrapper = mount(HeaderInfoOverlay, {
      props: defaultProps,
      global: globalConfig,
    });

    const overlay = document.body.querySelector(".info-overlay") as HTMLDivElement;
    expect(overlay).toBeTruthy();
    overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(wrapper.emitted("close")).toBeTruthy();
  });

  it("does not emit close when clicking inside the card", () => {
    const wrapper = mount(HeaderInfoOverlay, {
      props: defaultProps,
      global: globalConfig,
    });

    const card = document.body.querySelector(".info-card-expanded") as HTMLDivElement;
    expect(card).toBeTruthy();
    card.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(wrapper.emitted("close")).toBeFalsy();
  });
});
