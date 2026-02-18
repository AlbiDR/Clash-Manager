import { defineConfig, minimalPreset } from "@vite-pwa/assets-generator/config";
import type { Preset } from "@vite-pwa/assets-generator/config";

export default defineConfig({
  preset: {
    ...minimalPreset,
    transparent: {
      sizes: [64, 192, 512] as const,
      favicons: [[64, "favicon.ico"]] as const,
      resizeOptions: {
        fit: "contain" as const,
      },
      padding: 0.1, // Added small padding so it doesn't touch the edge
    },
    maskable: {
      sizes: [512] as const,
      resizeOptions: {
        // USING DARK BACKGROUND: Matches splash screen and app theme for seamless loading.
        background: "#0b0e14", 
        fit: "contain" as const,
      },
      // IMPORTANT: Android crops maskable icons. 
      // 0.18 (18%) padding ensures your logo stays inside the "Safe Zone" circle.
      padding: 0.18, 
    },
    apple: {
      sizes: [180] as const,
      resizeOptions: { background: "#ffffff" },
      padding: 0.1,
    },
    monochrome: {
      sizes: [512] as const,
      padding: 0.18, // Consistent with maskable
    },
  } satisfies Preset,
  images: ["public/assets/branding/logo.svg"] as const,
  manifestIconName: "pwa",
  maskableIconName: "pwa-maskable",
  appleIconName: "pwa-apple",
  monochromeIconName: "pwa-icon-monochrome",
});