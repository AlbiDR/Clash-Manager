
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import packageJson from './package.json'

// https://vite.dev/config/
export default defineConfig({
  define: {
    '__APP_VERSION__': JSON.stringify(packageJson.version)
  },
  plugins: [
    vue(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        id: 'clash-manager-v6',
        name: 'Clash Manager: Clan Manager for Clash Royale',
        short_name: 'Clash Manager',
        description: 'Clan Manager for Clash Royale - Track leaderboards, scout recruits, and analyze war performance.',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        display_override: ['standalone', 'window-controls-overlay', 'minimal-ui'],
        orientation: 'portrait',
        scope: '/Clash-Manager/',
        start_url: './index.html',
        share_target: {
          action: './index.html',
          method: 'GET',
          enctype: 'application/x-www-form-urlencoded',
          params: {
            title: 'title',
            text: 'text',
            url: 'url'
          }
        },
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ],
        screenshots: [
          {
            src: 'screenshot-mobile.png',
            sizes: '1080x2235',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'Mobile Dashboard'
          },
          {
            src: 'screenshot-desktop.png',
            sizes: '1865x1894',
            type: 'image/png',
            form_factor: 'wide',
            label: 'Desktop Dashboard'
          }
        ],
        shortcuts: [
          {
            name: '🏆 Leaderboard',
            short_name: 'Leaderboard',
            description: 'View current clan standings',
            url: './index.html#/leaderboard',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }]
          },
          {
            name: '🔭 Headhunter',
            short_name: 'Headhunter',
            description: 'Scout for new recruits',
            url: './index.html#/recruiter',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }]
          }
        ],
        categories: ['productivity', 'games'],
        launch_handler: {
          client_mode: 'auto'
        },
        edge_side_panel: {
          preferred_width: 400
        }
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        cleanupOutdatedCaches: true,
        navigateFallback: './index.html',
        navigateFallbackDenylist: [/^\/api/, /^https:\/\/script\.google\.com/],
        // ⚡ PERFORMANCE: Start fetching HTML while SW boots
        navigationPreload: true,
        runtimeCaching: [
          // 📡 WRITE OPERATIONS (POST): Use Background Sync for offline reliability
          {
            urlPattern: /^https:\/\/script\.google\.com\/.*/i,
            method: 'POST',
            handler: 'NetworkOnly',
            options: {
              backgroundSync: {
                name: 'gas-mutation-queue',
                options: {
                  maxRetentionTime: 24 * 60 // Retry for up to 24 hours
                }
              }
            }
          },
          // 📖 READ OPERATIONS (GET): Network First (fresh data), fallback to cache
          {
            urlPattern: /^https:\/\/script\.google\.com\/.*/i,
            method: 'GET',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'gas-api-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-stylesheets',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 30
              }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 365
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    })
  ],
  base: '/Clash-Manager/',
  build: {
    outDir: 'dist',
    sourcemap: false
  },
  test: {
    environment: 'jsdom',
    globals: true,
    exclude: ['**/node_modules/**', '**/dist/**'],
    setupFiles: './vitest.setup.ts'
  }
})
