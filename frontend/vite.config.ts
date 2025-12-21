
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
    vue() as any,
    tailwindcss() as any,
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'maskable-icon-512x512.png', 'pwa-192x192.png', 'pwa-512x512.png', 'logo.svg'],
      manifest: {
        id: 'clash-manager-v6',
        name: 'Clash Manager',
        short_name: 'Clash Manager',
        description: 'Clan Management System for Clash Royale Competitive Clans.',
        theme_color: '#0b0e14',
        background_color: '#0b0e14',
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
        orientation: 'portrait',
        scope: '/Clash-Manager/',
        start_url: '/Clash-Manager/index.html',
        handle_links: 'preferred',
        launch_handler: {
          client_mode: 'focus-existing'
        },
        share_target: {
          action: '/Clash-Manager/',
          method: 'GET',
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
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
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
            url: '/Clash-Manager/index.html#/leaderboard',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }]
          },
          {
            name: '🔭 Headhunter',
            short_name: 'Headhunter',
            description: 'Scout for new recruits',
            url: '/Clash-Manager/index.html#/recruiter',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }]
          }
        ],
        categories: ['productivity', 'games', 'utilities'],
        dir: 'ltr'
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false,
        navigateFallback: '/Clash-Manager/index.html',
        navigateFallbackDenylist: [/^\/api/, /^https:\/\/script\.google\.com/],
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
    }) as any
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
