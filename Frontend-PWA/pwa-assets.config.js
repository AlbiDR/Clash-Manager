import { defineConfig, minimalPreset } from "@vite-pwa/assets-generator/config";

export default defineConfig({
  preset: {
    ...minimalPreset,
    maskable: {
      sizes: [512],
      resizeOptions: {
        background: "#0b0e14",
        fit: "contain",
      },
      padding: 0.3,
    },
    apple: {
      sizes: [180],
      resizeOptions: { background: "#0b0e14" },
      padding: 0,
    },
  },
  images: ["public/logo.svg"],
});
