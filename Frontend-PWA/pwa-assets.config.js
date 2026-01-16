import { defineConfig, minimalPreset } from "@vite-pwa/assets-generator/config";

export default defineConfig({
  preset: {
    ...minimalPreset,
    // Add padding to standard icons to prevent clipping on Smart Launcher/Vivaldi
    transparent: {
      sizes: [64, 192, 512],
      favicons: [[64, "favicon.ico"]],
      resizeOptions: {
        background: "#0b0e14",
        fit: "contain",
      },
      padding: 0.1, // 10% padding to prevent edge bleed
    },
    // Maintain maskable padding for safe-zone compliance
    maskable: {
      sizes: [512],
      resizeOptions: {
        background: "#0b0e14",
        fit: "contain",
      },
      padding: 0.15, // 15% padding for a balanced logo size
    },
    apple: {
      sizes: [180],
      resizeOptions: { background: "#0b0e14" },
      padding: 0,
    },
  },
  images: ["public/logo.svg"],
});
