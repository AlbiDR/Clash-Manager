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
  describe("keyboard contract", () => {
    // This component's own docblock, and shared/ui/README.md, called it "a
    // keyboard-accessible replacement for native HTML select". It implemented
    // none of it: the options were non-focusable <li> carrying a click handler,
    // so a keyboard could open the list and then neither choose nor escape. It
    // is the sort control on every console.

    /** Opens the list and returns the trigger for further key presses. */
    async function openWithKeyboard(wrapper: ReturnType<typeof createWrapper>) {
      const trigger = wrapper.find(".select-trigger");
      await trigger.trigger("keydown", { key: "ArrowDown" });
      return trigger;
    }

    it("opens on ArrowDown and highlights the current selection", async () => {
      const wrapper = createWrapper({ modelValue: 2 });
      await openWithKeyboard(wrapper);

      expect(wrapper.find(".options-dropdown").exists()).toBe(true);
      expect(wrapper.findAll(".option-item")[1].classes()).toContain("is-keyboard-active");
    });

    it("walks the list with the arrow keys", async () => {
      const wrapper = createWrapper({ modelValue: 1 });
      const trigger = await openWithKeyboard(wrapper);

      await trigger.trigger("keydown", { key: "ArrowDown" });
      expect(wrapper.findAll(".option-item")[1].classes()).toContain("is-keyboard-active");

      await trigger.trigger("keydown", { key: "ArrowUp" });
      expect(wrapper.findAll(".option-item")[0].classes()).toContain("is-keyboard-active");
    });

    it("steps over a disabled option instead of landing on it", async () => {
      // Index 2 is disabled, so ArrowDown from 1 must reach 3.
      const wrapper = createWrapper({ modelValue: 2 });
      const trigger = await openWithKeyboard(wrapper);

      await trigger.trigger("keydown", { key: "ArrowDown" });

      const items = wrapper.findAll(".option-item");
      expect(items[2].classes()).not.toContain("is-keyboard-active");
      expect(items[3].classes()).toContain("is-keyboard-active");
    });

    it("commits the highlighted option on Enter", async () => {
      const wrapper = createWrapper({ modelValue: 1 });
      const trigger = await openWithKeyboard(wrapper);

      await trigger.trigger("keydown", { key: "ArrowDown" });
      await trigger.trigger("keydown", { key: "Enter" });

      expect(wrapper.emitted("update:modelValue")!.at(-1)).toEqual([2]);
      expect(wrapper.find(".options-dropdown").exists()).toBe(false);
    });

    it("closes on Escape without changing the selection", async () => {
      const wrapper = createWrapper({ modelValue: 1 });
      const trigger = await openWithKeyboard(wrapper);

      await trigger.trigger("keydown", { key: "ArrowDown" });
      await trigger.trigger("keydown", { key: "Escape" });

      expect(wrapper.find(".options-dropdown").exists()).toBe(false);
      expect(wrapper.emitted("update:modelValue")).toBeFalsy();
    });

    it("jumps to the ends with Home and End", async () => {
      const wrapper = createWrapper({ modelValue: 2 });
      const trigger = await openWithKeyboard(wrapper);

      await trigger.trigger("keydown", { key: "End" });
      // Index 3 is the last, and index 2 before it is disabled.
      expect(wrapper.findAll(".option-item")[3].classes()).toContain("is-keyboard-active");

      await trigger.trigger("keydown", { key: "Home" });
      expect(wrapper.findAll(".option-item")[0].classes()).toContain("is-keyboard-active");
    });

    it("announces the popup and points at the active option", async () => {
      const wrapper = createWrapper({ modelValue: 1 });
      const trigger = await openWithKeyboard(wrapper);

      expect(trigger.attributes("aria-haspopup")).toBe("listbox");
      expect(trigger.attributes("aria-controls")).toBe(wrapper.find(".options-list").attributes("id"));
      expect(trigger.attributes("aria-activedescendant"))
        .toBe(wrapper.findAll(".option-item")[0].attributes("id"));
    });

    it("references no active option while closed", () => {
      const wrapper = createWrapper();

      expect(wrapper.find(".select-trigger").attributes("aria-activedescendant")).toBeUndefined();
    });
  });
});
