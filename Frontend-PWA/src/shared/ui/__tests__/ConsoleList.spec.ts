// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ConsoleList from "../ConsoleList.vue";
import BaseCardSkeleton from "../BaseCardSkeleton.vue";

describe("ConsoleList", () => {
  const mockItems = [
    { id: "1", name: "Item 1" },
    { id: "2", name: "Item 2" },
    { id: "3", name: "Item 3" },
  ];

  it("renders all items in standard mode", () => {
    const wrapper = mount(ConsoleList, {
      props: {
        items: mockItems,
        isShowcaseMode: false,
      },
      slots: {
        item: `
          <template #item="{ item, index }">
            <div class="test-item">
              {{ item.name }} - {{ index }}
            </div>
          </template>
        `,
      },
    });

    const items = wrapper.findAll(".test-item");
    expect(items).toHaveLength(3);
    expect(items[0].text()).toContain("Item 1 - 0");
    expect(items[1].text()).toContain("Item 2 - 1");
    expect(items[2].text()).toContain("Item 3 - 2");
    expect(wrapper.findComponent(BaseCardSkeleton).exists()).toBe(false);
  });

  it("renders only the first item and 7 skeletons in showcase mode", () => {
    const wrapper = mount(ConsoleList, {
      props: {
        items: mockItems,
        isShowcaseMode: true,
      },
      slots: {
        item: `
          <template #item="{ item, index }">
            <div class="test-item">{{ item.name }}</div>
          </template>
        `,
      },
    });

    const items = wrapper.findAll(".test-item");
    expect(items).toHaveLength(1);
    expect(items[0].text()).toBe("Item 1");

    const skeletons = wrapper.findAllComponents(BaseCardSkeleton);
    expect(skeletons).toHaveLength(7);
  });

  it("renders nothing but skeletons in showcase mode if items is empty", () => {
    const wrapper = mount(ConsoleList, {
      props: {
        items: [],
        isShowcaseMode: true,
      },
    });

    expect(wrapper.find(".test-item").exists()).toBe(false);
    expect(wrapper.findAllComponents(BaseCardSkeleton)).toHaveLength(7);
  });

  it("renders nothing in standard mode if items is empty", () => {
    const wrapper = mount(ConsoleList, {
      props: {
        items: [],
        isShowcaseMode: false,
      },
    });

    expect(wrapper.findAll(".test-item")).toHaveLength(0);
    expect(wrapper.findComponent(BaseCardSkeleton).exists()).toBe(false);
  });
});
