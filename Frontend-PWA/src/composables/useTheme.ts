import { ref } from "vue";

export type Theme = "light" | "dark" | "auto";

const STORAGE_KEY = "cm_theme_preference";
const theme = ref<Theme>("auto");
const isInitialized = ref(false);

/**
 * 🎨 USE THEME
 * Manages system-aware dark mode and persistent theme preferences.
 */
export function useTheme() {
  const mediaQuery =
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-color-scheme: dark)")
      : null;

  function applyTheme() {
    if (typeof document === "undefined" || !mediaQuery) return;

    const root = document.documentElement;
    const isDark =
      theme.value === "auto" ? mediaQuery.matches : theme.value === "dark";

    if (isDark) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

    // Update PWA theme color meta tag to match the background color
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute("content", isDark ? "#0b0e14" : "#fdfcff");
    }

    // Update manifest screenshots
    updateManifest();
  }

  function setTheme(newTheme: Theme) {
    theme.value = newTheme;
    localStorage.setItem(STORAGE_KEY, newTheme);
    applyTheme();
  }

  function init() {
    if (isInitialized.value || typeof window === "undefined") return;

    const cached = localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (cached && ["light", "dark", "auto"].includes(cached)) {
      theme.value = cached;
    }

    // 🛡️ Logic: Memory-safe singleton listener for system changes (Memory #10)
    if (mediaQuery) {
      mediaQuery.addEventListener("change", () => {
        if (theme.value === "auto") applyTheme();
      });
    }

    applyTheme();
    updateManifest(); // Initial manifest update
    isInitialized.value = true;
  }

  // 🧩 MANIFEST SWAPPER: Dynamic injection of theme-aware screenshots
  async function updateManifest() {
    if (typeof document === "undefined") return;

    // 1. Determine current visual state
    const isDark = document.documentElement.classList.contains("dark");
    const suffix = isDark ? "dark" : "light";

    // 2. Define targeted screenshots
    const manualScreenshots = [
      {
        src: `screenshot-mobile-${suffix}.webp`,
        sizes: "1080x1920",
        type: "image/webp",
        form_factor: "narrow",
        label: `Clash Manager Mobile (${suffix})`,
      },
      {
        src: `screenshot-desktop-${suffix}.webp`,
        sizes: "1920x1080",
        type: "image/webp",
        form_factor: "wide",
        label: `Clash Manager Desktop (${suffix})`,
      },
    ];

    try {
      // 3. Find existing link
      const link = document.querySelector(
        'link[rel="manifest"]',
      ) as HTMLLinkElement;
      if (!link) return;

      // 4. Fetch original manifest if we haven't cached the base yet
      // (Simplified: Re-fetching is cheap for small JSON and ensures freshness)
      const initialManifest = await fetch("/manifest.json").then((res) =>
        res.json(),
      );

      // 5. Construct new manifest
      const newManifest = {
        ...initialManifest,
        screenshots: manualScreenshots,
      };

      // 6. Create Blob URI
      const stringManifest = JSON.stringify(newManifest);
      const blob = new Blob([stringManifest], { type: "application/json" });
      const manifestURL = URL.createObjectURL(blob);

      // 7. Swap (forcing browser re-read)
      link.href = manifestURL;

      console.log(`[PWA] Manifest updated for ${suffix} theme`);
    } catch (e) {
      console.warn("[PWA] Failed to update dynamic manifest", e);
    }
  }

  return {
    theme,
    setTheme,
    init,
  };
}
