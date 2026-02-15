import { describe, it, expect, vi, beforeEach } from "vitest";

describe("useTheme", () => {
  let useTheme: any;

  beforeEach(async () => {
    // Reset modules to clear singleton state (isInitialized, theme)
    vi.resetModules();
    const mod = await import("../useTheme");
    useTheme = mod.useTheme;

    vi.clearAllMocks();
    localStorage.clear();
    document.documentElement.classList.remove("dark");

    // Default matchMedia to light mode
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
    }));

    vi.stubGlobal("URL", {
      createObjectURL: vi.fn().mockReturnValue("blob:manifest"),
      revokeObjectURL: vi.fn(),
    });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ name: "Clash Manager", screenshots: [] }),
    }));
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

});
