import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import packageJson from './package.json'

export default defineConfig({
  define: {
    '__APP_VERSION__': JSON.stringify(packageJson.version)
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    cssCodeSplit: true, // ⚡ Enabled splitting to prevent blocking render with unused CSS
    rollupOptions: {
      output: {
        // ⚡ Code Splitting Enabled: Allows lazy-loaded routes to be fetched on demand
        manualChunks: {
          'vendor': ['vue', 'vue-router', '@formkit/auto-animate'],
          // Zod is heavy, keep it separate so it doesn't block LCP
          'validation': ['zod']
        }
      }
    }
  },
  plugins: [
    vue() as any,
    tailwindcss() as any,
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png', 'logo.png'],
      manifest: {
        id: '/Clash-Manager/', // Unique ID for Android to treat as separate app
        name: 'Clash Manager',
        short_name: 'Clash Manager',
        description: 'Advanced analytics and recruitment tool for Clash Royale clans',
        theme_color: '#6750a4',
        background_color: '#0b0e14',
        display: 'standalone', // Critical: removes browser UI
        orientation: 'portrait-primary', // Lock to portrait for mobile
        scope: '/Clash-Manager/',
        start_url: '/Clash-Manager/index.html',
        categories: ['productivity', 'utilities', 'games'], // Helps OS categorize the app
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable' // Android adaptive icon support
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ],
        // App shortcuts for long-press menu (Android)
        shortcuts: [
          {
            name: 'Leaderboard',
            short_name: 'Leaderboard',
            description: 'View clan member rankings',
            url: '/Clash-Manager/index.html#/leaderboard',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }]
          },
          {
            name: 'Recruits',
            short_name: 'Recruits',
            description: 'Browse potential recruits',
            url: '/Clash-Manager/index.html#/recruiter',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }]
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,woff2}'],
        // Add badge support for mobile PWAs
        additionalManifestEntries: [],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365
              },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-stylesheets',
              expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 * 30 }
            }
          },
          {
            urlPattern: /^https:\/\/script\.google\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'gas-api-cache',
              expiration: { maxEntries: 5 }
            }
          }
        ]
      },
      // Inject custom Service Worker code for badge handling
      injectManifest: false,
      srcDir: undefined,
      filename: undefined,
      strategies: 'generateSW',
      injectRegister: 'auto',
      devOptions: {
        enabled: false
      }
    }) as any
  ],
  base: '/Clash-Manager/'
})
