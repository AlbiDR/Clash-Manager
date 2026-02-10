import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import { VitePWA } from "vite-plugin-pwa";
import { visualizer } from "rollup-plugin-visualizer";
import packageJson from "./package.json";

// View-specific components excluded from monolithic UI bundle.
// This allows them to be bundled with their respective lazy-loaded views,
// reducing the initial payload and ensuring better cache granularity.
const VIEW_SPECIFIC_COMPONENTS = [
  "WarHistoryChart.vue",
  "MemberCard.vue",
  "MemberCardSkeleton.vue",
  "RecruitCard.vue",
  "RecruitCardSkeleton.vue",
  "SettingsCard.vue",
  "SkeletonSettingsCard.vue",
  "/src/components/settings/",
];

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@core": fileURLToPath(new URL("./src/core", import.meta.url)),
      "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)),
      "@features": fileURLToPath(new URL("./src/features", import.meta.url)),
      "@app": fileURLToPath(new URL("./src/app", import.meta.url)),
    },
  },
  // GitHub Pages deployment requires the repo name in the base path
  base: "/Clash-Manager/",
  build: {
    outDir: "dist",
    sourcemap: false,
    cssCodeSplit: true,
    target: "chrome100",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("vue") || id.includes("vue-router")) {
              return "vendor-core";
            }
            if (id.includes("valibot")) {
              return "vendor-validation";
            }
            if (id.includes("workbox-")) {
              return "vendor-pwa";
            }
            if (id.includes("@formkit")) {
              return "vendor-ui-deps";
            }
            return "vendor-stable";
          }
          if (id.includes("/src/api/") || id.includes("/src/types/")) {
            return "core-api";
          }
          if (id.includes("/src/components/")) {
            // PERFORMANCE: Exclude view-specific components from monolithic UI bundle.
            if (VIEW_SPECIFIC_COMPONENTS.some((comp) => id.includes(comp))) {
              return;
            }

            return "ui-components";
          }
          if (id.includes("/src/composables/")) {
            return "business-logic";
          }
        },
      },
    },
  },
  plugins: [
    vue() as any,
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      manifest: false, // Already exists in public/manifest.json
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      devOptions: {
        enabled: true,
        type: "module",
      },
    }),
    ...(process.env.ANALYZE
      ? [
          visualizer({
            filename: "dist/stats.html",
            open: true,
          }),
        ]
      : []),
  ],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["vitest.setup.ts"],
  },
});
