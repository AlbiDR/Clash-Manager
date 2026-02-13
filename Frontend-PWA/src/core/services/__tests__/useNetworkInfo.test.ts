import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("useNetworkInfo", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("navigator", undefined);
  });

  it("should detect if connection is supported", async () => {
    vi.stubGlobal("navigator", { connection: { addEventListener: vi.fn() } });
    const { useNetworkInfo } = await import("../useNetworkInfo");
    const { isSupported } = useNetworkInfo();
    expect(isSupported).toBe(true);
  });

  it("should handle unsupported connection", async () => {
    vi.stubGlobal("navigator", {});
    const { useNetworkInfo } = await import("../useNetworkInfo");
    const { isSupported } = useNetworkInfo();
    expect(isSupported).toBe(false);
  });

  it("should hydrate initial state from connection", async () => {
    const mockConnection = {
      effectiveType: "3g",
      downlink: 5,
      saveData: true,
      rtt: 100,
      addEventListener: vi.fn(),
    };
    vi.stubGlobal("navigator", { connection: mockConnection });

    const { useNetworkInfo } = await import("../useNetworkInfo");
    const { effectiveType, downlink, saveData, rtt } = useNetworkInfo();

    expect(effectiveType.value).toBe("3g");
    expect(downlink.value).toBe(5);
    expect(saveData.value).toBe(true);
    expect(rtt.value).toBe(100);
  });

  describe("isSlowConnection", () => {
    it("should identify 2g as slow", async () => {
      vi.stubGlobal("navigator", {
        connection: {
          effectiveType: "2g",
          downlink: 10,
          rtt: 50,
          addEventListener: vi.fn()
        }
      });
      const { useNetworkInfo } = await import("../useNetworkInfo");
      const { isSlowConnection } = useNetworkInfo();
      expect(isSlowConnection.value).toBe(true);
    });

    it("should identify slow-2g as slow", async () => {
      vi.stubGlobal("navigator", {
        connection: {
          effectiveType: "slow-2g",
          downlink: 10,
          rtt: 50,
          addEventListener: vi.fn()
        }
      });
      const { useNetworkInfo } = await import("../useNetworkInfo");
      const { isSlowConnection } = useNetworkInfo();
      expect(isSlowConnection.value).toBe(true);
    });

    it("should identify high RTT as slow", async () => {
      vi.stubGlobal("navigator", {
        connection: {
          effectiveType: "4g",
          downlink: 10,
          rtt: 600,
          addEventListener: vi.fn()
        }
      });
      const { useNetworkInfo } = await import("../useNetworkInfo");
      const { isSlowConnection } = useNetworkInfo();
      expect(isSlowConnection.value).toBe(true);
    });

    it("should identify low downlink as slow", async () => {
      vi.stubGlobal("navigator", {
        connection: {
          effectiveType: "4g",
          downlink: 0.5,
          rtt: 50,
          addEventListener: vi.fn()
        }
      });
      const { useNetworkInfo } = await import("../useNetworkInfo");
      const { isSlowConnection } = useNetworkInfo();
      expect(isSlowConnection.value).toBe(true);
    });

    it("should identify 4g with good stats as NOT slow", async () => {
      vi.stubGlobal("navigator", {
        connection: {
          effectiveType: "4g",
          downlink: 10,
          rtt: 50,
          addEventListener: vi.fn()
        }
      });
      const { useNetworkInfo } = await import("../useNetworkInfo");
      const { isSlowConnection } = useNetworkInfo();
      expect(isSlowConnection.value).toBe(false);
    });
  });

  it("should update on change event", async () => {
    let changeHandler: any;
    const mockConnection = {
      effectiveType: "4g",
      downlink: 10,
      rtt: 50,
      addEventListener: vi.fn((event, handler) => {
        if (event === "change") changeHandler = handler;
      }),
    };
    vi.stubGlobal("navigator", { connection: mockConnection });

    const { useNetworkInfo } = await import("../useNetworkInfo");
    const { effectiveType, downlink } = useNetworkInfo();

    expect(effectiveType.value).toBe("4g");

    // Simulate change
    mockConnection.effectiveType = "3g";
    mockConnection.downlink = 2;
    if (changeHandler) changeHandler();

    expect(effectiveType.value).toBe("3g");
    expect(downlink.value).toBe(2);
  });
});
