import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        id: '/Clash-Manager/',
        name: 'Clash Manager: Clan Manager for Clash Royale',
        short_name: 'Clash Manager',
        description: 'Clan Manager for Clash Royale - Track leaderboards, scout recruits, and analyze war performance.',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        display_override: ['standalone', 'fullscreen', 'minimal-ui'], // Fallback chain for display modes
        orientation: 'portrait',
        scope: '/Clash-Manager/',
        start_url: '/Clash-Manager/',
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
        // Rich Install UI: Add actual screenshots of your app here later
        // This makes the Android install prompt look like an App Store listing
        screenshots: [
          {
            src: 'pwa-512x512.png', // Placeholder: Replace with actual screenshot later
            sizes: '512x512',
            type: 'image/png',
            form_factor: 'wide',
            label: 'Desktop Dashboard'
          },
          {
            src: 'pwa-512x512.png', // Placeholder: Replace with actual screenshot later
            sizes: '512x512',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'Mobile Leaderboard'
          }
        ],
        shortcuts: [
          {
            name: '🏆 Leaderboard',
            short_name: 'Leaderboard',
            description: 'View current clan standings',
            url: '/Clash-Manager/',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }]
          },
          {
            name: '🔭 Headhunter',
            short_name: 'Headhunter',
            description: 'Scout for new recruits',
            url: '/Clash-Manager/recruiter',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }]
          }
        ],
        categories: ['productivity', 'games'],
        launch_handler: {
          client_mode: 'auto'
        }
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Clean up old caches to prevent storage bloat
        cleanupOutdatedCaches: true, 
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/script\.google\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'gas-api-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 // 24 hours
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          // Cache Google Fonts (Stylesheets)
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-stylesheets',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
              }
            }
          },
          // Cache Google Fonts (Font Files)
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst', // Fonts rarely change, serve from cache immediately
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
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
  base: '/Clash-Manager/', // CRITICAL: This must match your GitHub Repo name case-sensitively
  build: {
    outDir: 'dist',
    sourcemap: false
  }
})
