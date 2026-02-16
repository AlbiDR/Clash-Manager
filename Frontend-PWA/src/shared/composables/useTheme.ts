import { ref } from "vue";
import { darkTokens, generateCssVariables, lightTokens } from "../../core/theme/tokens";

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
    const targetTokens = isDark ? darkTokens : lightTokens;
    const variables = generateCssVariables(targetTokens);
    
    // Inject tokens as style properties on root
    Object.entries(variables).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });

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

  // 🧠 Cache Storage
  let baseManifestCache: any = null;
  const manifestBlobCache: Record<string, string> = {};

  // 🧩 MANIFEST SWAPPER: Dynamic injection of theme-aware screenshots
  async function updateManifest() {
    if (typeof document === "undefined") return;

    // 1. Determine current visual state
    const isDark = document.documentElement.classList.contains("dark");
    const suffix = isDark ? "dark" : "light";

    // ⚡ OPTIMIZATION: Return cached Blob URI if already generated
    if (manifestBlobCache[suffix]) {
      const link = document.querySelector(
        'link[rel="manifest"]',
      ) as HTMLLinkElement;
      if (link && link.href !== manifestBlobCache[suffix]) {
        link.href = manifestBlobCache[suffix];
        console.log(`[PWA] Swapped to cached manifest for ${suffix}`);
      }
      return;
    }

    // 2. Define targeted screenshots
    const manualScreenshots = [
      {
        src: `headhunter-${suffix}.webp`,
        sizes: "1080x1920",
        type: "image/webp",
        form_factor: "narrow",
        label: `Clash Manager Headhunter (${suffix})`,
      },
      {
        src: `roster-${suffix}.webp`,
        sizes: "1920x1080",
        type: "image/webp",
        form_factor: "wide",
        label: `Clash Manager Roster (${suffix})`,
      },
    ];

    try {
      // 3. Find existing link
      const link = document.querySelector(
        'link[rel="manifest"]',
      ) as HTMLLinkElement;
      if (!link) return;

      // 4. Fetch or use cached base manifest
      if (!baseManifestCache) {
        // use href of existing link to ensure base path is handled correctly
        const fetchUrl = link.getAttribute("href") || "manifest.json";
        baseManifestCache = await fetch(fetchUrl).then((res) => res.json());

        // FIX: Resolve all relative icon paths to absolute to work with Blob URL
        const baseUrl = import.meta.env.BASE_URL;
        const resolvePath = (p: string) => (p.startsWith("/") || p.startsWith("http") ? p : `${baseUrl}${p}`);
        
        if (baseManifestCache.icons) {
          baseManifestCache.icons = baseManifestCache.icons.map((icon: any) => ({
            ...icon,
            src: resolvePath(icon.src)
          }));
        }
        if (baseManifestCache.shortcuts) {
          baseManifestCache.shortcuts = baseManifestCache.shortcuts.map((shortcut: any) => ({
            ...shortcut,
            icons: shortcut.icons?.map((icon: any) => ({
              ...icon,
              src: resolvePath(icon.src)
            }))
          }));
        }
      }

      // 5. Construct new manifest
      const baseUrl = import.meta.env.BASE_URL;
      const themeColors = isDark
        ? { theme_color: "#0b0e14", background_color: "#0b0e14" }
        : { theme_color: "#fdfcff", background_color: "#fdfcff" };

      const newManifest = {
        ...baseManifestCache,
        ...themeColors,
        screenshots: manualScreenshots.map(s => ({
          ...s,
          src: `${baseUrl}assets/branding/${s.src}`
        })),
      };

      // 6. Create Blob URI
      const stringManifest = JSON.stringify(newManifest);
      const blob = new Blob([stringManifest], { type: "application/json" });
      const manifestURL = URL.createObjectURL(blob);

      // 7. Cache and Swap
      manifestBlobCache[suffix] = manifestURL;
      link.href = manifestURL;

      console.log(`[PWA] Generated and updated manifest for ${suffix} theme`);
    } catch (e) {
      console.warn("[PWA] Failed to update dynamic manifest", e);
    }
  }

  /**
   * 🧹 MANIFEST PURGE
   * Explicitly clears the manifest URI cache to force re-generation.
   * satisfying user recovery requirements for icon/pwa reloading.
   */
  function clearManifestCache() {
    Object.keys(manifestBlobCache).forEach((key) => {
      URL.revokeObjectURL(manifestBlobCache[key]);
      delete manifestBlobCache[key];
    });
    baseManifestCache = null;
    console.log("[PWA] Manifest cache cleared");
  }

  return {
    theme,
    setTheme,
    init,
    clearManifestCache,
  };
}
