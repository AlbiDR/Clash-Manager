// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

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
  "/src/features/",
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
      "@static": fileURLToPath(new URL("./public", import.meta.url)),
      "@root": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  // GitHub Pages deployment requires the repo name in the base path
  base: "/Clash-Manager/",
  build: {
    outDir: "dist",
    target: ["es2022", "edge112", "firefox112", "chrome112", "safari16.4"],
    modulePreload: {
      polyfill: false,
    },
    sourcemap: false,
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            // Core Vue Ecosystem (Prioritized for fast PWA boot)
            if (
              id.includes("vue") ||
              id.includes("vue-router") ||
              id.includes("pinia")
            ) {
              return "vendor-core";
            }
            // Auxiliary Libraries (Consolidated to reduce HTTP overhead in WebView)
            if (
              id.includes("valibot") ||
              id.includes("workbox-") ||
              id.includes("@formkit") ||
              id.includes("@supabase")
            ) {
              return "vendor-aux";
            }
            return "vendor-stable";
          }
          if (id.includes("/src/core/")) {
            return "core-logic";
          }
          if (id.includes("/src/shared/")) {
            if (VIEW_SPECIFIC_COMPONENTS.some((comp) => id.includes(comp))) {
              return;
            }
            return "shared-ui";
          }
          if (id.includes("/src/features/")) {
            return; // Features should be lazy chunks by default
          }
        },
      },
    },
  },
  plugins: [
    vue() as any,
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "script-defer",
      strategies: "injectManifest",
      srcDir: "src/app",
      filename: "sw.ts",
      manifest: false, // Already exists in public/manifest.json
      injectManifest: {
        // [OPTIMIZATION] Included webp for high-resolution game assets and screenshots.
        // Large branding screenshots and data-heavy game assets are excluded
        // to minimize SW cache footprint and update bandwidth.
        // We also exclude the large variable font to prioritize the core app shell.
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webp,woff2}"],
        globIgnores: [
          "assets/branding/*.webp",
          "assets/game/*.webp",
          "assets/icons/pwa-apple.png",
          "assets/icons/icon-512.png",
          "fonts/JetBrainsMono-Bold.woff2",
          "fonts/Inter-Variable.woff2",
          "**/splash.png",
          "assets/branding/logo.svg",
          "assets/branding/favicon.ico",
        ],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      devOptions: {
        enabled: true,
        type: "module",
      },
    }),
    // 3. App Shell Injection (Hydrate the synthesized HTML placeholders)
    {
      name: "app-shell-hydration",
      transformIndexHtml(html) {
        return html; // Content already synthesized, this hook remains for future dynamic logic
      },
    },
    visualizer({
      filename: "dist/stats.html",
      title: "Clash Manager PWA Bundle Analysis",
      template: "treemap",
      gzipSize: true,
      brotliSize: true,
      open: process.env.ANALYZE === "true",
    }),
  ],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["vitest.setup.ts"],
  },
});
