/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import EmptyState from "../EmptyState.vue";
import Icon from "../Icon.vue";

describe("EmptyState.vue", () => {
  it("renders the message correctly", () => {
    const message = "No data found";
    const wrapper = mount(EmptyState, {
      props: { message },
      global: {
        components: { Icon }
      }
    });
    expect(wrapper.find(".empty-message").text()).toBe(message);
  });

  it("renders the default icon when none is provided", () => {
    const wrapper = mount(EmptyState, {
      props: { message: "Test" },
      global: {
        components: { Icon }
      }
    });
    const icon = wrapper.findComponent(Icon);
    expect(icon.props("name")).toBe("telescope");
  });

  it("renders the provided icon", () => {
    const wrapper = mount(EmptyState, {
      props: { message: "Test", icon: "search" },
      global: {
        components: { Icon }
      }
    });
    const icon = wrapper.findComponent(Icon);
    expect(icon.props("name")).toBe("search");
  });

  it("renders the hint when provided", () => {
    const hint = "Try searching for something else";
    const wrapper = mount(EmptyState, {
      props: { message: "Test", hint },
      global: {
        components: { Icon }
      }
    });
    expect(wrapper.find(".empty-hint").exists()).toBe(true);
    expect(wrapper.find(".empty-hint").text()).toBe(hint);
  });

  it("does not render the hint when not provided", () => {
    const wrapper = mount(EmptyState, {
      props: { message: "Test" },
      global: {
        components: { Icon }
      }
    });
    expect(wrapper.find(".empty-hint").exists()).toBe(false);
  });

  it("renders the action slot content", () => {
    const wrapper = mount(EmptyState, {
      props: { message: "Test" },
      slots: {
        action: '<button id="test-btn">Action</button>'
      },
      global: {
        components: { Icon }
      }
    });
    expect(wrapper.find("#test-btn").exists()).toBe(true);
    expect(wrapper.find("#test-btn").text()).toBe("Action");
  });
});
