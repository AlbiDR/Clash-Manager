import { defineConfig, minimalPreset } from "@vite-pwa/assets-generator/config";

export default defineConfig({
  preset: {
    ...minimalPreset,
    // Renaming to v2 to force cache busting
    transparent: {
      sizes: [64, 192, 512],
      favicons: [[64, "favicon.ico"]],
      resizeOptions: {
        background: "#0b0e14",
        fit: "contain",
      },
      padding: 0.2, // Aggressive 20% padding
    },
    maskable: {
      sizes: [512],
      resizeOptions: {
        background: "#0b0e14",
        fit: "contain",
      },
      padding: 0.2, // Matching standard icons for consistency
    },
    apple: {
      sizes: [180],
      resizeOptions: { background: "#0b0e14" },
      padding: 0.1,
    },
  },
  images: ["public/logo.svg"],
  // Custom naming to ensure cache busting at the manifest level
  manifestIconName: "icon-v2",
  maskableIconName: "maskable-v2",
  appleIconName: "apple-v2",
});
