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
      padding: 0, // Added small padding so it doesn't touch the edge
    },
    maskable: {
      sizes: [512] as const,
      resizeOptions: {
        // CHANGED: Using white ensures it looks natural in Light Mode. 
        // Android will clip this into a circle.
        background: "#ffffff", 
        fit: "contain" as const,
      },
      padding: 0, 
    },
    apple: {
      sizes: [180] as const,
      resizeOptions: { background: "#ffffff" },
      padding: 0,
    },
  } satisfies Preset,
  images: ["public/assets/branding/logo.svg"] as const,
  manifestIconName: "pwa",
  maskableIconName: "pwa-maskable",
  appleIconName: "pwa-apple",
});
