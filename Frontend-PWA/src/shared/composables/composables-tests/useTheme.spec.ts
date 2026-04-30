import { describe, it, expect, vi, beforeEach } from "vitest";

describe("useTheme", () => {
  let useTheme: any;

  beforeEach(async () => {
    // Reset modules to clear singleton state (isInitialized, theme)
    vi.resetModules();
    vi.unstubAllGlobals();
    const mod = await import("../useTheme");
    useTheme = mod.useTheme;

    vi.clearAllMocks();
    localStorage.clear();
    document.documentElement.classList.remove("dark");

    // Mocking style.setProperty
    const styleMock = {
      setProperty: vi.fn(),
      removeProperty: vi.fn(),
    };
    Object.defineProperty(document.documentElement, "style", {
      value: styleMock,
      configurable: true,
    });

    document.head.innerHTML = "";

    // Default matchMedia to light mode
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
    }));

    // Mock URL static methods without destroying the global URL constructor
    if (!globalThis.URL.createObjectURL) {
      globalThis.URL.createObjectURL = vi.fn().mockReturnValue("blob:manifest");
      globalThis.URL.revokeObjectURL = vi.fn();
    } else {
      vi.spyOn(globalThis.URL, "createObjectURL").mockReturnValue("blob:manifest");
      vi.spyOn(globalThis.URL, "revokeObjectURL").mockImplementation(() => {});
    }

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ name: "Clash Manager", screenshots: [] }),
    }));

    vi.useFakeTimers();
  });

  it("initializes with auto theme by default", () => {
    const { theme } = useTheme();
    expect(theme.value).toBe("auto");
  });

  it("sets and persists theme in localStorage", () => {
    const { setTheme, theme } = useTheme();
    setTheme("dark");
    expect(theme.value).toBe("dark");
    expect(localStorage.getItem("cm_theme_preference")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("applies dark class when system preference is dark and theme is auto", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
    }));

    const { init } = useTheme();
    init();

    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("removes dark class when theme is set to light", () => {
    document.documentElement.classList.add("dark");
    const { setTheme } = useTheme();

    setTheme("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("loads theme from localStorage on init", () => {
    localStorage.setItem("cm_theme_preference", "dark");
    const { init, theme } = useTheme();

    init();
    expect(theme.value).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  describe("Visual Side Effects", () => {
    it("manages theme-color meta tags correctly", () => {
      // Setup: Add a legacy meta tag
      const legacyMeta = document.createElement("meta");
      legacyMeta.name = "theme-color";
      legacyMeta.content = "#old-color";
      document.head.appendChild(legacyMeta);

      const { setTheme } = useTheme();

      // Test Dark Mode
      setTheme("dark");
      let metaTags = document.querySelectorAll('meta[name="theme-color"]');
      expect(metaTags.length).toBe(1);
      expect((metaTags[0] as HTMLMetaElement).content).toBe("#0b0e14");
      expect(document.head.contains(legacyMeta)).toBe(false);

      // Test Light Mode
      setTheme("light");
      metaTags = document.querySelectorAll('meta[name="theme-color"]');
      expect(metaTags.length).toBe(1);
      expect((metaTags[0] as HTMLMetaElement).content).toBe("#fdfcff");
    });

    it("applies CSS variables to document root", () => {
      const { setTheme } = useTheme();
      const spy = vi.spyOn(document.documentElement.style, "setProperty");

      setTheme("dark");

      // Verify some key tokens are applied
      expect(spy).toHaveBeenCalledWith("--sys-color-primary", "#a8c7fa");
      expect(spy).toHaveBeenCalledWith("--sys-color-background", "#0b0e14");
      expect(spy).toHaveBeenCalledWith("--sys-surface-glass-blur", "blur(24px) saturate(180%)");

      spy.mockClear();
      setTheme("light");
      expect(spy).toHaveBeenCalledWith("--sys-color-primary", "#0061a4");
      expect(spy).toHaveBeenCalledWith("--sys-color-background", "#fdfcff");
    });
  });

  describe("Manifest Management & System Events", () => {
    it("clears manifest cache and revokes Blob URIs", async () => {
      const { clearManifestCache, init } = useTheme();

      // First initialize to generate some cache
      const manifestLink = document.createElement("link");
      manifestLink.rel = "manifest";
      manifestLink.href = "manifest.json";
      document.head.appendChild(manifestLink);

      init();
      // Need to wait for async updateManifest in init
      await vi.runAllTimersAsync();

      clearManifestCache();
      expect(URL.revokeObjectURL).toHaveBeenCalled();
    });

    it("updates manifest link href on initialization", async () => {
      const manifestLink = document.createElement("link");
      manifestLink.rel = "manifest";
      manifestLink.href = "manifest.json";
      document.head.appendChild(manifestLink);

      const { init } = useTheme();
      init();

      await vi.runAllTimersAsync();
      expect(manifestLink.href).toContain("blob:manifest");
    });

    it("registers matchMedia listener and reacts to changes in auto mode", () => {
      const addListenerSpy = vi.fn();
      const matchesMock = {
        matches: false,
        addEventListener: addListenerSpy,
      };
      vi.stubGlobal("matchMedia", vi.fn().mockReturnValue(matchesMock));

      const { init } = useTheme();
      init();

      expect(addListenerSpy).toHaveBeenCalledWith("change", expect.any(Function));

      // Manually trigger the listener
      const callback = addListenerSpy.mock.calls[0][1];

      // Simulate system switch to dark
      matchesMock.matches = true;

      callback();
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });
  });

  describe("Crawler & Compatibility Guards", () => {
    it("skips manifest swap when Lighthouse user agent is detected", async () => {
      // Mock Lighthouse User Agent
      vi.stubGlobal("navigator", {
        userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4512.0 Safari/537.36 Chrome-Lighthouse",
      });

      const manifestLink = document.createElement("link");
      manifestLink.rel = "manifest";
      manifestLink.href = "manifest.json";
      document.head.appendChild(manifestLink);

      const { init } = useTheme();
      init();

      await vi.runAllTimersAsync();
      
      // href should remain the static one, not a blob
      expect(manifestLink.href).toBe("http://localhost:3000/manifest.json"); 
      expect(URL.createObjectURL).not.toHaveBeenCalled();
    });
  });

  describe("Error Handling & State Integrity", () => {
    it("catches and logs fetch failures in updateManifest gracefully", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network Error")));
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const manifestLink = document.createElement("link");
      manifestLink.rel = "manifest";
      manifestLink.href = "manifest.json";
      document.head.appendChild(manifestLink);

      const { init } = useTheme();
      init();

      await vi.runAllTimersAsync();
      expect(warnSpy).toHaveBeenCalledWith("[PWA] Failed to update dynamic manifest", expect.any(Error));
    });

    it("handles invalid theme in localStorage by defaulting to 'auto'", () => {
      localStorage.setItem("cm_theme_preference", "invalid-theme" as any);
      const { init, theme } = useTheme();

      init();
      expect(theme.value).toBe("auto");
    });

    it("prevents multiple initializations", () => {
      const matchMediaSpy = vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
      });
      vi.stubGlobal("matchMedia", matchMediaSpy);

      const { init } = useTheme();

      init();
      init();

      // On second init, it should return early.
      // The module-level mediaQuery is created on first import, not inside useTheme().
      // applyTheme inside init calls matchMedia again if not cached, but it uses the module level mediaQuery.
      // Actually, applyTheme uses mediaQuery from useTheme closure.
      expect(matchMediaSpy).toHaveBeenCalledTimes(1);
    });
  });
});
