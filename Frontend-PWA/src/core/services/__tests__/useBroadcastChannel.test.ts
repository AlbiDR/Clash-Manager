import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";

describe("useBroadcastChannel", () => {
  const mockPostMessage = vi.fn();
  const mockClose = vi.fn();
  const mockAddEventListener = vi.fn();
  const mockRemoveEventListener = vi.fn();

  const MockBroadcastChannel = vi.fn().mockImplementation((name: string) => ({
    name,
    postMessage: mockPostMessage,
    close: mockClose,
    addEventListener: mockAddEventListener,
    removeEventListener: mockRemoveEventListener,
  }));

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function withSetup(composable: () => any) {
    let result;
    const wrapper = mount(defineComponent({
      setup() {
        result = composable();
        return () => h("div");
      }
    }));
    return [result, wrapper] as const;
  }

  it("initializes a BroadcastChannel with the correct name", async () => {
    const { useBroadcastChannel } = await import("../useBroadcastChannel");
    withSetup(() => useBroadcastChannel());
    expect(MockBroadcastChannel).toHaveBeenCalledWith("clash_manager_broadcast");
  });

  it("posts messages correctly", async () => {
    const { useBroadcastChannel } = await import("../useBroadcastChannel");
    const [composable] = withSetup(() => useBroadcastChannel());
    const { post } = composable as any;

    const msg: any = { type: "FORCE_REFRESH" };
    post(msg);

    expect(mockPostMessage).toHaveBeenCalledWith(msg);
  });

  it("registers message listener if onMessage is provided", async () => {
    const { useBroadcastChannel } = await import("../useBroadcastChannel");
    const onMessage = vi.fn();
    withSetup(() => useBroadcastChannel(onMessage));

    expect(mockAddEventListener).toHaveBeenCalledWith("message", expect.any(Function));
  });

  it("calls onMessage when a message is received", async () => {
    const { useBroadcastChannel } = await import("../useBroadcastChannel");
    const onMessage = vi.fn();
    withSetup(() => useBroadcastChannel(onMessage));

    const handler = mockAddEventListener.mock.calls[0][1];
    const mockEvent = { data: { type: "BADGE_UPDATE", count: 5 } };
    handler(mockEvent);

    expect(onMessage).toHaveBeenCalledWith(mockEvent.data);
  });

  it("cleans up on unmount", async () => {
    const { useBroadcastChannel } = await import("../useBroadcastChannel");

    const [_, wrapper] = withSetup(() => useBroadcastChannel(vi.fn()));
    wrapper.unmount();

    expect(mockRemoveEventListener).toHaveBeenCalled();
    expect(mockClose).toHaveBeenCalled();
  });

  it("handles environment without BroadcastChannel support", async () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    const { useBroadcastChannel } = await import("../useBroadcastChannel");

    let isSupported, post;
    withSetup(() => {
      const res = useBroadcastChannel();
      isSupported = res.isSupported;
      post = res.post;
    });

    expect(isSupported).toBe(false);

    // Should not crash when calling post
    (post as any)({ type: "FORCE_REFRESH" });
    expect(mockPostMessage).not.toHaveBeenCalled();
  });
});
