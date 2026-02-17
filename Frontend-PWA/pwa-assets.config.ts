import { defineConfig, minimalPreset } from "@vite-pwa/assets-generator/config";
import type { Preset } from "@vite-pwa/assets-generator/config";

export default defineConfig({
  preset: {
    ...minimalPreset,
    // Using 0 padding here because padding is now BAKED INTO THE SVG SOURCE
    transparent: {
      sizes: [64, 192, 512] as const,
      favicons: [[64, "favicon.ico"]] as const,
      resizeOptions: {
        fit: "contain" as const,
      },
      padding: 0,
    },
    maskable: {
      sizes: [512] as const,
      resizeOptions: {
        background: "#0b0e14",
        fit: "contain" as const,
      },
      padding: 0, // Relying on source SVG padding for safe-zone
    },
    apple: {
      sizes: [180] as const,
      resizeOptions: { background: "#0b0e14" },
      padding: 0,
    },
  } satisfies Preset,
  images: ["public/assets/branding/logo.svg"] as const,
  // Standard naming to match the manifest
  manifestIconName: "pwa",
  maskableIconName: "pwa-maskable",
  appleIconName: "pwa-apple",
});
