import { defineConfig, minimalPreset } from "@vite-pwa/assets-generator/config";

export default defineConfig({
  preset: {
    ...minimalPreset,
    // Override standard icons to be OPAQUE (fixes Vivaldi "no background" issue)
    transparent: {
      sizes: [64, 192, 512],
      favicons: [[64, "favicon.ico"]],
      resizeOptions: {
        background: "#0b0e14",
        fit: "contain",
      },
      padding: 0,
    },
    // Tune maskable icons to be LARGER (fixes Chrome "small icon" issue)
    maskable: {
      sizes: [512],
      resizeOptions: {
        background: "#0b0e14",
        fit: "contain",
      },
      padding: 0.15, // Reduced from 0.3 to 0.15 for ~20% larger logo
    },
    apple: {
      sizes: [180],
      resizeOptions: { background: "#0b0e14" },
      padding: 0,
    },
  },
  images: ["public/logo.svg"],
});
