import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { vTactile } from "../vTactile";
import { defineComponent } from "vue";

describe("vTactile directive", () => {
  const mockOnTap = vi.fn();
  const mockOnLongPress = vi.fn();
  const vibrateSpy = vi.fn();

  const TestComponent = defineComponent({
    directives: { tactile: vTactile },
    props: ["onTap", "onLongPress"],
    template: `
      <div v-tactile="{ onTap, onLongPress }" class="target" style="width: 100px; height: 100px;">
        <button class="btn-action">Action</button>
        <a href="#" class="link">Link</a>
        <div class="hit-target">Hit Target</div>
        <div class="normal">Normal</div>
      </div>
    `,
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    // Mock navigator.vibrate
    vi.stubGlobal("navigator", {
      vibrate: vibrateSpy,
    });

    // Mock devicePixelRatio
    vi.stubGlobal("devicePixelRatio", 1);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("should trigger onTap and vibrate(12) on quick release", async () => {
    const wrapper = mount(TestComponent, {
      props: { onTap: mockOnTap, onLongPress: mockOnLongPress }
    });

    const target = wrapper.find(".target");

    await target.trigger("pointerdown", { button: 0, clientX: 10, clientY: 10 });
    await target.trigger("pointerup");

    expect(mockOnTap).toHaveBeenCalled();
    expect(vibrateSpy).toHaveBeenCalledWith(12);
    expect(mockOnLongPress).not.toHaveBeenCalled();
  });

  it("should trigger onLongPress and vibrate(60) after delay", async () => {
    const wrapper = mount(TestComponent, {
      props: { onTap: mockOnTap, onLongPress: mockOnLongPress }
    });

    const target = wrapper.find(".target");

    await target.trigger("pointerdown", { button: 0, clientX: 10, clientY: 10 });

    vi.advanceTimersByTime(500);

    expect(mockOnLongPress).toHaveBeenCalled();
    expect(vibrateSpy).toHaveBeenCalledWith(60);

    await target.trigger("pointerup");
    expect(mockOnTap).not.toHaveBeenCalled(); // Tap should be blocked after long press
  });

  it("should cancel interaction if moved beyond threshold", async () => {
    const wrapper = mount(TestComponent, {
      props: { onTap: mockOnTap, onLongPress: mockOnLongPress }
    });

    const target = wrapper.find(".target");

    await target.trigger("pointerdown", { button: 0, clientX: 10, clientY: 10 });
    // moveThreshold = 10 * 1 = 10. move to 21. dx = 11.
    await target.trigger("pointermove", { clientX: 21, clientY: 10 });
    await target.trigger("pointerup");

    expect(mockOnTap).not.toHaveBeenCalled();
    expect(vibrateSpy).not.toHaveBeenCalled();
  });

  it("should NOT trigger if clicking actionable elements", async () => {
    const wrapper = mount(TestComponent, {
      props: { onTap: mockOnTap, onLongPress: mockOnLongPress }
    });

    const btn = wrapper.find(".btn-action");
    await btn.trigger("pointerdown", { button: 0, clientX: 10, clientY: 10 });
    await btn.trigger("pointerup");
    expect(mockOnTap).not.toHaveBeenCalled();

    const link = wrapper.find(".link");
    await link.trigger("pointerdown", { button: 0, clientX: 10, clientY: 10 });
    await link.trigger("pointerup");
    expect(mockOnTap).not.toHaveBeenCalled();

    const hit = wrapper.find(".hit-target");
    await hit.trigger("pointerdown", { button: 0, clientX: 10, clientY: 10 });
    await hit.trigger("pointerup");
    expect(mockOnTap).not.toHaveBeenCalled();
  });

  it("should ignore non-primary pointer buttons", async () => {
    const wrapper = mount(TestComponent, {
      props: { onTap: mockOnTap, onLongPress: mockOnLongPress }
    });

    const target = wrapper.find(".target");

    await target.trigger("pointerdown", { button: 1, clientX: 10, clientY: 10 });
    await target.trigger("pointerup");

    expect(mockOnTap).not.toHaveBeenCalled();
  });

  it("should prevent context menu", async () => {
    const wrapper = mount(TestComponent);
    const target = wrapper.find(".target");

    const event = new Event("contextmenu", { cancelable: true });
    const preventDefaultSpy = vi.spyOn(event, "preventDefault");

    target.element.dispatchEvent(event);
    expect(preventDefaultSpy).toHaveBeenCalled();
  });

  it("should cleanup listeners on unmount", () => {
    const removeSpy = vi.spyOn(HTMLElement.prototype, "removeEventListener");
    const wrapper = mount(TestComponent);

    wrapper.unmount();

    expect(removeSpy).toHaveBeenCalledWith("pointerdown", expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith("pointermove", expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith("pointerup", expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith("pointercancel", expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith("contextmenu", expect.any(Function));
  });
});
