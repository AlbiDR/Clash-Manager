import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import packageJson from "./package.json";

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  // Use root path '/' for Tauri to ensure assets load correctly.
  base: "/",
  build: {
    outDir: "dist",
    sourcemap: false,
    cssCodeSplit: true,
    target: "chrome100",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (
              id.includes("vue") ||
              id.includes("vue-router") ||
              id.includes("@formkit/auto-animate")
            ) {
              return "vendor-core";
            }
            if (id.includes("zod")) {
              return "vendor-validation";
            }
            return "vendor-stable";
          }
          if (id.includes("/src/components/")) {
            return "ui-components";
          }
          if (id.includes("/src/composables/")) {
            return "business-logic";
          }
        },
      },
    },
  },
  plugins: [vue() as any, tailwindcss() as any],
});
