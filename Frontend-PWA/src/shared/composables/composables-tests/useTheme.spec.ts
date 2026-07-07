// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("useTheme", () => {
  let useTheme: any;

  /** Helper to read Blob content as text in JSDOM environment */
  const readBlob = async (b: Blob) => {
    const reader = new FileReader();
    const promise = new Promise<string>((resolve) => {
      reader.onload = () => resolve(reader.result as string);
    });
    reader.readAsText(b);
    if (vi.isFakeTimers()) {
      await vi.advanceTimersByTimeAsync(100);
    }
    return promise;
  };

  beforeEach(async () => {
    // Reset modules to clear singleton state (isInitialized, theme)
    vi.resetModules();
    vi.unstubAllGlobals();
    const mod = await import("../useTheme");
    useTheme = mod.useTheme;

    vi.clearAllMocks();
    localStorage.clear();
    document.documentElement.classList.remove("dark");

    document.documentElement.style.cssText = "";

    document.head.innerHTML = "";

    // Default matchMedia to light mode
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
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

  afterEach(() => {
    vi.useRealTimers();
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

      setTheme("dark");

      // Verify some key tokens are applied natively using CSSOM
      expect(document.documentElement.style.getPropertyValue("--sys-color-primary")).toBe("#a8c7fa");
      expect(document.documentElement.style.getPropertyValue("--sys-color-background")).toBe("#0b0e14");
      expect(document.documentElement.style.getPropertyValue("--sys-surface-glass-blur")).toBe("blur(24px) saturate(180%)");

      setTheme("light");
      expect(document.documentElement.style.getPropertyValue("--sys-color-primary")).toBe("#0061a4");
      expect(document.documentElement.style.getPropertyValue("--sys-color-background")).toBe("#fdfcff");
    });
  });

  describe("Manifest Cache & Events", () => {
    it("handles clearManifestCache as a no-op", () => {
      const { clearManifestCache } = useTheme();
      expect(() => clearManifestCache()).not.toThrow();
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

  describe("Error Handling & State Integrity", () => {
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
