import { defineConfig, minimalPreset } from "@vite-pwa/assets-generator/config";

export default defineConfig({
  preset: {
    ...minimalPreset,
    // Using 0 padding here because padding is now BAKED INTO THE SVG SOURCE
    transparent: {
      sizes: [64, 192, 512],
      favicons: [[64, "favicon.ico"]],
      resizeOptions: {
        background: "#0b0e14",
        fit: "contain",
      },
      padding: 0,
    },
    maskable: {
      sizes: [512],
      resizeOptions: {
        background: "#0b0e14",
        fit: "contain",
      },
      padding: 0, // Relying on source SVG padding for safe-zone
    },
    apple: {
      sizes: [180],
      resizeOptions: { background: "#0b0e14" },
      padding: 0,
    },
  },
  images: ["public/logo.svg"],
  // Standard naming to match the manifest
  manifestIconName: "pwa",
  maskableIconName: "pwa-maskable",
  appleIconName: "pwa-apple",
});
