// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import BaseSelect from "../BaseSelect.vue";

describe("BaseSelect.vue", () => {
  const options = [
    { label: "Option 1", value: 1 },
    { label: "Option 2", value: 2 },
    { label: "Disabled Option", value: 3, disabled: true },
    { label: "Milestone Option", value: 4, class: "milestone" },
  ];

  const createWrapper = (props = {}, options_mount = {}) => {
    return mount(BaseSelect, {
      props: {
        modelValue: 1,
        options,
        ...props
      },
      global: {
        stubs: {
          Icon: {
            template: '<i class="mock-icon" :name="name"></i>',
            props: ['name']
          }
        }
      },
      ...options_mount
    });
  };

  it("renders correctly with initial props", () => {
    const wrapper = createWrapper();
    expect(wrapper.find(".trigger-label").text()).toBe("Option 1");
    expect(wrapper.find(".options-dropdown").exists()).toBe(false);
  });

  it("toggles dropdown on click", async () => {
    const wrapper = createWrapper();
    const trigger = wrapper.find(".select-trigger");

    await trigger.trigger("click");
    expect(wrapper.find(".options-dropdown").exists()).toBe(true);

    await trigger.trigger("click");
    expect(wrapper.find(".options-dropdown").exists()).toBe(false);
  });

  it("emits update:modelValue when an option is selected", async () => {
    const wrapper = createWrapper();
    await wrapper.find(".select-trigger").trigger("click");

    const optionItems = wrapper.findAll(".option-item");
    await optionItems[1].trigger("click"); // Option 2

    expect(wrapper.emitted("update:modelValue")).toBeTruthy();
    expect(wrapper.emitted("update:modelValue")![0]).toEqual([2]);
    expect(wrapper.find(".options-dropdown").exists()).toBe(false);
  });

  it("does not emit update:modelValue when a disabled option is clicked", async () => {
    const wrapper = createWrapper();
    await wrapper.find(".select-trigger").trigger("click");

    const disabledOption = wrapper.find(".option-item.disabled");
    await disabledOption.trigger("click");

    expect(wrapper.emitted("update:modelValue")).toBeFalsy();
    expect(wrapper.find(".options-dropdown").exists()).toBe(true);
  });

  it("closes dropdown when clicking outside", async () => {
    const wrapper = createWrapper({}, { attachTo: document.body });
    await wrapper.find(".select-trigger").trigger("click");
    expect(wrapper.find(".options-dropdown").exists()).toBe(true);

    // Simulate click outside on body
    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await wrapper.vm.$nextTick();

    expect(wrapper.find(".options-dropdown").exists()).toBe(false);
    wrapper.unmount();
  });

  it("renders placeholder when no value matches", () => {
    const wrapper = createWrapper({ modelValue: 99, placeholder: "Custom Placeholder" });
    expect(wrapper.find(".trigger-label").text()).toBe("Custom Placeholder");
  });

  it("applies semantic classes to options", async () => {
    const wrapper = createWrapper();
    await wrapper.find(".select-trigger").trigger("click");

    const milestoneOption = wrapper.find(".option-item.milestone");
    expect(milestoneOption.exists()).toBe(true);
    expect(milestoneOption.text()).toBe("Milestone Option");
  });

  it("handles empty options gracefully", () => {
    const wrapper = createWrapper({ options: [], modelValue: null });
    expect(wrapper.find(".trigger-label").text()).toBe("Select...");
  });
});
