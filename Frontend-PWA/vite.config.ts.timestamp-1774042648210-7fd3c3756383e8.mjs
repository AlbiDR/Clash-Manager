// vite.config.ts
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "file:///Users/ADR/Documents/Github/Projects/clash-manager/node_modules/.pnpm/vitest@1.6.1_@types+node@24.10.9_jsdom@24.1.3_lightningcss@1.30.2_terser@5.46.0/node_modules/vitest/dist/config.js";
import vue from "file:///Users/ADR/Documents/Github/Projects/clash-manager/node_modules/.pnpm/@vitejs+plugin-vue@6.0.3_vite@7.3.1_@types+node@24.10.9_jiti@2.6.1_lightningcss@1.30.2__5c6c0c6112f07bcf1ca1fc007e5d4043/node_modules/@vitejs/plugin-vue/dist/index.mjs";
import { VitePWA } from "file:///Users/ADR/Documents/Github/Projects/clash-manager/node_modules/.pnpm/vite-plugin-pwa@1.2.0_@vite-pwa+assets-generator@1.0.2_vite@7.3.1_@types+node@24.10.9_j_1487b1cc9c9709927dbc90309830fdfe/node_modules/vite-plugin-pwa/dist/index.js";
import { visualizer } from "file:///Users/ADR/Documents/Github/Projects/clash-manager/node_modules/.pnpm/rollup-plugin-visualizer@6.0.5_rollup@2.79.2/node_modules/rollup-plugin-visualizer/dist/plugin/index.js";

// package.json
var package_default = {
  name: "clash-manager-pwa",
  private: true,
  version: "13.1.0",
  license: "GPL-3.0-only",
  description: "A modern, material design PWA for managing Clash Royale clans.",
  author: "AlbiDR",
  repository: {
    type: "git",
    url: "https://github.com/albidr/Clash-Manager.git"
  },
  homepage: "https://albidr.github.io/Clash-Manager/",
  type: "module",
  scripts: {
    dev: "pnpm run synthesize && vite",
    build: "pnpm run synthesize && pnpm run type-check && vite build",
    synthesize: "tsx scripts/synthesize_entry.ts",
    preview: "vite preview",
    test: "vitest run",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest run --coverage",
    "type-check": "vue-tsc --noEmit"
  },
  dependencies: {
    "@formkit/auto-animate": "^0.9.0",
    pinia: "^3.0.4",
    valibot: "^1.3.1",
    vue: "^3.5.30",
    "vue-router": "^4.6.4",
    "workbox-precaching": "^7.4.0",
    "workbox-window": "^7.4.0"
  },
  devDependencies: {
    "@types/node": "^24.10.9",
    "@vite-pwa/assets-generator": "^1.0.2",
    "@vitejs/plugin-vue": "^6.0.3",
    "@vue/test-utils": "^2.4.6",
    "@vue/tsconfig": "^0.8.1",
    jsdom: "^24.1.0",
    "rollup-plugin-visualizer": "^6.0.5",
    tsx: "^4.19.2",
    typescript: "~5.9.3",
    vite: "^7.3.1",
    "vite-plugin-pwa": "^1.2.0",
    vitest: "^1.6.1",
    "vue-tsc": "^3.2.5"
  }
};

// vite.config.ts
var __vite_injected_original_import_meta_url = "file:///Users/ADR/Documents/Github/Projects/clash-manager/Frontend-PWA/vite.config.ts";
var VIEW_SPECIFIC_COMPONENTS = [
  "WarHistoryChart.vue",
  "MemberCard.vue",
  "MemberCardSkeleton.vue",
  "RecruitCard.vue",
  "RecruitCardSkeleton.vue",
  "SettingsCard.vue",
  "SkeletonSettingsCard.vue",
  "/src/features/"
];
var vite_config_default = defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(package_default.version)
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", __vite_injected_original_import_meta_url)),
      "@core": fileURLToPath(new URL("./src/core", __vite_injected_original_import_meta_url)),
      "@shared": fileURLToPath(new URL("./src/shared", __vite_injected_original_import_meta_url)),
      "@features": fileURLToPath(new URL("./src/features", __vite_injected_original_import_meta_url)),
      "@app": fileURLToPath(new URL("./src/app", __vite_injected_original_import_meta_url)),
      "@static": fileURLToPath(new URL("./public", __vite_injected_original_import_meta_url)),
      "@root": fileURLToPath(new URL(".", __vite_injected_original_import_meta_url))
    }
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
            return;
          }
        }
      }
    }
  },
  plugins: [
    vue(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      strategies: "injectManifest",
      srcDir: "src/app",
      filename: "sw.ts",
      manifest: false,
      // Already exists in public/manifest.json
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024
      },
      devOptions: {
        enabled: true,
        type: "module"
      }
    }),
    // 3. App Shell Injection (Hydrate the synthesized HTML placeholders)
    {
      name: "app-shell-hydration",
      transformIndexHtml(html) {
        return html;
      }
    },
    ...process.env.ANALYZE ? [
      visualizer({
        filename: "dist/stats.html",
        open: true
      })
    ] : []
  ],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["vitest.setup.ts"]
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiLCAicGFja2FnZS5qc29uIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZGlybmFtZSA9IFwiL1VzZXJzL0FEUi9Eb2N1bWVudHMvR2l0aHViL1Byb2plY3RzL2NsYXNoLW1hbmFnZXIvRnJvbnRlbmQtUFdBXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvVXNlcnMvQURSL0RvY3VtZW50cy9HaXRodWIvUHJvamVjdHMvY2xhc2gtbWFuYWdlci9Gcm9udGVuZC1QV0Evdml0ZS5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL1VzZXJzL0FEUi9Eb2N1bWVudHMvR2l0aHViL1Byb2plY3RzL2NsYXNoLW1hbmFnZXIvRnJvbnRlbmQtUFdBL3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgZmlsZVVSTFRvUGF0aCwgVVJMIH0gZnJvbSBcIm5vZGU6dXJsXCI7XG5pbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tIFwidml0ZXN0L2NvbmZpZ1wiO1xuaW1wb3J0IHZ1ZSBmcm9tIFwiQHZpdGVqcy9wbHVnaW4tdnVlXCI7XG5pbXBvcnQgeyBWaXRlUFdBIH0gZnJvbSBcInZpdGUtcGx1Z2luLXB3YVwiO1xuaW1wb3J0IHsgdmlzdWFsaXplciB9IGZyb20gXCJyb2xsdXAtcGx1Z2luLXZpc3VhbGl6ZXJcIjtcbmltcG9ydCBwYWNrYWdlSnNvbiBmcm9tIFwiLi9wYWNrYWdlLmpzb25cIjtcbmltcG9ydCB7IGdldEFwcFNoZWxsU3R5bGVzLCBnZXRBcHBTaGVsbEh0bWwgfSBmcm9tIFwiLi9zcmMvY29yZS90aGVtZS9BcHBTaGVsbFwiO1xuaW1wb3J0IHsgZ2VuZXJhdGVIdG1sRW50cnkgfSBmcm9tIFwiLi9zcmMvY29yZS90aGVtZS9IdG1sRW50cnlcIjtcblxuLy8gVmlldy1zcGVjaWZpYyBjb21wb25lbnRzIGV4Y2x1ZGVkIGZyb20gbW9ub2xpdGhpYyBVSSBidW5kbGUuXG4vLyBUaGlzIGFsbG93cyB0aGVtIHRvIGJlIGJ1bmRsZWQgd2l0aCB0aGVpciByZXNwZWN0aXZlIGxhenktbG9hZGVkIHZpZXdzLFxuLy8gcmVkdWNpbmcgdGhlIGluaXRpYWwgcGF5bG9hZCBhbmQgZW5zdXJpbmcgYmV0dGVyIGNhY2hlIGdyYW51bGFyaXR5LlxuY29uc3QgVklFV19TUEVDSUZJQ19DT01QT05FTlRTID0gW1xuICBcIldhckhpc3RvcnlDaGFydC52dWVcIixcbiAgXCJNZW1iZXJDYXJkLnZ1ZVwiLFxuICBcIk1lbWJlckNhcmRTa2VsZXRvbi52dWVcIixcbiAgXCJSZWNydWl0Q2FyZC52dWVcIixcbiAgXCJSZWNydWl0Q2FyZFNrZWxldG9uLnZ1ZVwiLFxuICBcIlNldHRpbmdzQ2FyZC52dWVcIixcbiAgXCJTa2VsZXRvblNldHRpbmdzQ2FyZC52dWVcIixcbiAgXCIvc3JjL2ZlYXR1cmVzL1wiLFxuXTtcblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgZGVmaW5lOiB7XG4gICAgX19BUFBfVkVSU0lPTl9fOiBKU09OLnN0cmluZ2lmeShwYWNrYWdlSnNvbi52ZXJzaW9uKSxcbiAgfSxcbiAgcmVzb2x2ZToge1xuICAgIGFsaWFzOiB7XG4gICAgICBcIkBcIjogZmlsZVVSTFRvUGF0aChuZXcgVVJMKFwiLi9zcmNcIiwgaW1wb3J0Lm1ldGEudXJsKSksXG4gICAgICBcIkBjb3JlXCI6IGZpbGVVUkxUb1BhdGgobmV3IFVSTChcIi4vc3JjL2NvcmVcIiwgaW1wb3J0Lm1ldGEudXJsKSksXG4gICAgICBcIkBzaGFyZWRcIjogZmlsZVVSTFRvUGF0aChuZXcgVVJMKFwiLi9zcmMvc2hhcmVkXCIsIGltcG9ydC5tZXRhLnVybCkpLFxuICAgICAgXCJAZmVhdHVyZXNcIjogZmlsZVVSTFRvUGF0aChuZXcgVVJMKFwiLi9zcmMvZmVhdHVyZXNcIiwgaW1wb3J0Lm1ldGEudXJsKSksXG4gICAgICBcIkBhcHBcIjogZmlsZVVSTFRvUGF0aChuZXcgVVJMKFwiLi9zcmMvYXBwXCIsIGltcG9ydC5tZXRhLnVybCkpLFxuICAgICAgXCJAc3RhdGljXCI6IGZpbGVVUkxUb1BhdGgobmV3IFVSTChcIi4vcHVibGljXCIsIGltcG9ydC5tZXRhLnVybCkpLFxuICAgICAgXCJAcm9vdFwiOiBmaWxlVVJMVG9QYXRoKG5ldyBVUkwoXCIuXCIsIGltcG9ydC5tZXRhLnVybCkpLFxuICAgIH0sXG4gIH0sXG4gIC8vIEdpdEh1YiBQYWdlcyBkZXBsb3ltZW50IHJlcXVpcmVzIHRoZSByZXBvIG5hbWUgaW4gdGhlIGJhc2UgcGF0aFxuICBiYXNlOiBcIi9DbGFzaC1NYW5hZ2VyL1wiLFxuICBidWlsZDoge1xuICAgIG91dERpcjogXCJkaXN0XCIsXG4gICAgc291cmNlbWFwOiBmYWxzZSxcbiAgICBjc3NDb2RlU3BsaXQ6IHRydWUsXG4gICAgdGFyZ2V0OiBcImNocm9tZTEwMFwiLFxuICAgIHJvbGx1cE9wdGlvbnM6IHtcbiAgICAgIG91dHB1dDoge1xuICAgICAgICBtYW51YWxDaHVua3MoaWQpIHtcbiAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoXCJub2RlX21vZHVsZXNcIikpIHtcbiAgICAgICAgICAgIGlmIChpZC5pbmNsdWRlcyhcInZ1ZVwiKSB8fCBpZC5pbmNsdWRlcyhcInZ1ZS1yb3V0ZXJcIikpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIFwidmVuZG9yLWNvcmVcIjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChpZC5pbmNsdWRlcyhcInZhbGlib3RcIikpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIFwidmVuZG9yLXZhbGlkYXRpb25cIjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChpZC5pbmNsdWRlcyhcIndvcmtib3gtXCIpKSB7XG4gICAgICAgICAgICAgIHJldHVybiBcInZlbmRvci1wd2FcIjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChpZC5pbmNsdWRlcyhcIkBmb3Jta2l0XCIpKSB7XG4gICAgICAgICAgICAgIHJldHVybiBcInZlbmRvci11aS1kZXBzXCI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gXCJ2ZW5kb3Itc3RhYmxlXCI7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChpZC5pbmNsdWRlcyhcIi9zcmMvY29yZS9cIikpIHtcbiAgICAgICAgICAgIHJldHVybiBcImNvcmUtbG9naWNcIjtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKFwiL3NyYy9zaGFyZWQvXCIpKSB7XG4gICAgICAgICAgICBpZiAoVklFV19TUEVDSUZJQ19DT01QT05FTlRTLnNvbWUoKGNvbXApID0+IGlkLmluY2x1ZGVzKGNvbXApKSkge1xuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gXCJzaGFyZWQtdWlcIjtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKFwiL3NyYy9mZWF0dXJlcy9cIikpIHtcbiAgICAgICAgICAgIHJldHVybjsgLy8gRmVhdHVyZXMgc2hvdWxkIGJlIGxhenkgY2h1bmtzIGJ5IGRlZmF1bHRcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0sXG4gIH0sXG4gIHBsdWdpbnM6IFtcbiAgICB2dWUoKSBhcyBhbnksXG4gICAgVml0ZVBXQSh7XG4gICAgICByZWdpc3RlclR5cGU6IFwiYXV0b1VwZGF0ZVwiLFxuICAgICAgaW5qZWN0UmVnaXN0ZXI6IFwiYXV0b1wiLFxuICAgICAgc3RyYXRlZ2llczogXCJpbmplY3RNYW5pZmVzdFwiLFxuICAgICAgc3JjRGlyOiBcInNyYy9hcHBcIixcbiAgICAgIGZpbGVuYW1lOiBcInN3LnRzXCIsXG4gICAgICBtYW5pZmVzdDogZmFsc2UsIC8vIEFscmVhZHkgZXhpc3RzIGluIHB1YmxpYy9tYW5pZmVzdC5qc29uXG4gICAgICBpbmplY3RNYW5pZmVzdDoge1xuICAgICAgICBnbG9iUGF0dGVybnM6IFtcIioqLyoue2pzLGNzcyxodG1sLGljbyxwbmcsc3ZnLHdvZmYyfVwiXSxcbiAgICAgICAgbWF4aW11bUZpbGVTaXplVG9DYWNoZUluQnl0ZXM6IDUgKiAxMDI0ICogMTAyNCxcbiAgICAgIH0sXG4gICAgICBkZXZPcHRpb25zOiB7XG4gICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICAgIHR5cGU6IFwibW9kdWxlXCIsXG4gICAgICB9LFxuICAgIH0pLFxuICAgIC8vIDMuIEFwcCBTaGVsbCBJbmplY3Rpb24gKEh5ZHJhdGUgdGhlIHN5bnRoZXNpemVkIEhUTUwgcGxhY2Vob2xkZXJzKVxuICAgIHtcbiAgICAgIG5hbWU6IFwiYXBwLXNoZWxsLWh5ZHJhdGlvblwiLFxuICAgICAgdHJhbnNmb3JtSW5kZXhIdG1sKGh0bWwpIHtcbiAgICAgICAgcmV0dXJuIGh0bWw7IC8vIENvbnRlbnQgYWxyZWFkeSBzeW50aGVzaXplZCwgdGhpcyBob29rIHJlbWFpbnMgZm9yIGZ1dHVyZSBkeW5hbWljIGxvZ2ljXG4gICAgICB9LFxuICAgIH0sXG4gICAgLi4uKHByb2Nlc3MuZW52LkFOQUxZWkVcbiAgICAgID8gW1xuICAgICAgICAgIHZpc3VhbGl6ZXIoe1xuICAgICAgICAgICAgZmlsZW5hbWU6IFwiZGlzdC9zdGF0cy5odG1sXCIsXG4gICAgICAgICAgICBvcGVuOiB0cnVlLFxuICAgICAgICAgIH0pLFxuICAgICAgICBdXG4gICAgICA6IFtdKSxcbiAgXSxcbiAgdGVzdDoge1xuICAgIGdsb2JhbHM6IHRydWUsXG4gICAgZW52aXJvbm1lbnQ6IFwianNkb21cIixcbiAgICBzZXR1cEZpbGVzOiBbXCJ2aXRlc3Quc2V0dXAudHNcIl0sXG4gIH0sXG59KTtcbiIsICJ7XG4gIFwibmFtZVwiOiBcImNsYXNoLW1hbmFnZXItcHdhXCIsXG4gIFwicHJpdmF0ZVwiOiB0cnVlLFxuICBcInZlcnNpb25cIjogXCIxMy4xLjBcIixcbiAgXCJsaWNlbnNlXCI6IFwiR1BMLTMuMC1vbmx5XCIsXG4gIFwiZGVzY3JpcHRpb25cIjogXCJBIG1vZGVybiwgbWF0ZXJpYWwgZGVzaWduIFBXQSBmb3IgbWFuYWdpbmcgQ2xhc2ggUm95YWxlIGNsYW5zLlwiLFxuICBcImF1dGhvclwiOiBcIkFsYmlEUlwiLFxuICBcInJlcG9zaXRvcnlcIjoge1xuICAgIFwidHlwZVwiOiBcImdpdFwiLFxuICAgIFwidXJsXCI6IFwiaHR0cHM6Ly9naXRodWIuY29tL2FsYmlkci9DbGFzaC1NYW5hZ2VyLmdpdFwiXG4gIH0sXG4gIFwiaG9tZXBhZ2VcIjogXCJodHRwczovL2FsYmlkci5naXRodWIuaW8vQ2xhc2gtTWFuYWdlci9cIixcbiAgXCJ0eXBlXCI6IFwibW9kdWxlXCIsXG4gIFwic2NyaXB0c1wiOiB7XG4gICAgXCJkZXZcIjogXCJwbnBtIHJ1biBzeW50aGVzaXplICYmIHZpdGVcIixcbiAgICBcImJ1aWxkXCI6IFwicG5wbSBydW4gc3ludGhlc2l6ZSAmJiBwbnBtIHJ1biB0eXBlLWNoZWNrICYmIHZpdGUgYnVpbGRcIixcbiAgICBcInN5bnRoZXNpemVcIjogXCJ0c3ggc2NyaXB0cy9zeW50aGVzaXplX2VudHJ5LnRzXCIsXG4gICAgXCJwcmV2aWV3XCI6IFwidml0ZSBwcmV2aWV3XCIsXG4gICAgXCJ0ZXN0XCI6IFwidml0ZXN0IHJ1blwiLFxuICAgIFwidGVzdDp1aVwiOiBcInZpdGVzdCAtLXVpXCIsXG4gICAgXCJ0ZXN0OmNvdmVyYWdlXCI6IFwidml0ZXN0IHJ1biAtLWNvdmVyYWdlXCIsXG4gICAgXCJ0eXBlLWNoZWNrXCI6IFwidnVlLXRzYyAtLW5vRW1pdFwiXG4gIH0sXG4gIFwiZGVwZW5kZW5jaWVzXCI6IHtcbiAgICBcIkBmb3Jta2l0L2F1dG8tYW5pbWF0ZVwiOiBcIl4wLjkuMFwiLFxuICAgIFwicGluaWFcIjogXCJeMy4wLjRcIixcbiAgICBcInZhbGlib3RcIjogXCJeMS4zLjFcIixcbiAgICBcInZ1ZVwiOiBcIl4zLjUuMzBcIixcbiAgICBcInZ1ZS1yb3V0ZXJcIjogXCJeNC42LjRcIixcbiAgICBcIndvcmtib3gtcHJlY2FjaGluZ1wiOiBcIl43LjQuMFwiLFxuICAgIFwid29ya2JveC13aW5kb3dcIjogXCJeNy40LjBcIlxuICB9LFxuICBcImRldkRlcGVuZGVuY2llc1wiOiB7XG4gICAgXCJAdHlwZXMvbm9kZVwiOiBcIl4yNC4xMC45XCIsXG4gICAgXCJAdml0ZS1wd2EvYXNzZXRzLWdlbmVyYXRvclwiOiBcIl4xLjAuMlwiLFxuICAgIFwiQHZpdGVqcy9wbHVnaW4tdnVlXCI6IFwiXjYuMC4zXCIsXG4gICAgXCJAdnVlL3Rlc3QtdXRpbHNcIjogXCJeMi40LjZcIixcbiAgICBcIkB2dWUvdHNjb25maWdcIjogXCJeMC44LjFcIixcbiAgICBcImpzZG9tXCI6IFwiXjI0LjEuMFwiLFxuICAgIFwicm9sbHVwLXBsdWdpbi12aXN1YWxpemVyXCI6IFwiXjYuMC41XCIsXG4gICAgXCJ0c3hcIjogXCJeNC4xOS4yXCIsXG4gICAgXCJ0eXBlc2NyaXB0XCI6IFwifjUuOS4zXCIsXG4gICAgXCJ2aXRlXCI6IFwiXjcuMy4xXCIsXG4gICAgXCJ2aXRlLXBsdWdpbi1wd2FcIjogXCJeMS4yLjBcIixcbiAgICBcInZpdGVzdFwiOiBcIl4xLjYuMVwiLFxuICAgIFwidnVlLXRzY1wiOiBcIl4zLjIuNVwiXG4gIH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBK1csU0FBUyxlQUFlLFdBQVc7QUFDbFosU0FBUyxvQkFBb0I7QUFDN0IsT0FBTyxTQUFTO0FBQ2hCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGtCQUFrQjs7O0FDSjNCO0FBQUEsRUFDRSxNQUFRO0FBQUEsRUFDUixTQUFXO0FBQUEsRUFDWCxTQUFXO0FBQUEsRUFDWCxTQUFXO0FBQUEsRUFDWCxhQUFlO0FBQUEsRUFDZixRQUFVO0FBQUEsRUFDVixZQUFjO0FBQUEsSUFDWixNQUFRO0FBQUEsSUFDUixLQUFPO0FBQUEsRUFDVDtBQUFBLEVBQ0EsVUFBWTtB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
