import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ErrorState from "../ErrorState.vue";

describe("ErrorState.vue", () => {
  it("renders the error message", () => {
    const message = "Network Synchronization Failed";
    const wrapper = mount(ErrorState, {
      props: { message },
    });
    expect(wrapper.text()).toContain(message);
    expect(wrapper.text()).toContain("Re-Synchronize");
  });

  it("emits retry event when button is clicked", async () => {
    const wrapper = mount(ErrorState, {
      props: { message: "Error" },
    });
    
    const button = wrapper.find("button");
    await button.trigger("click");
    
    expect(wrapper.emitted()).toHaveProperty("retry");
  });

  it("matches snapshot for visual consistency", () => {
    const wrapper = mount(ErrorState, {
      props: { message: "System Anomaly Detected" },
    });
    expect(wrapper.html()).toMatchSnapshot();
  });
});
