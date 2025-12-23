
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import packageJson from './package.json'

export default defineConfig({
  define: {
    '__APP_VERSION__': JSON.stringify(packageJson.version)
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    cssCodeSplit: false, // Bundle CSS together to reduce handshake overhead
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('vue')) return 'v-core';
            if (id.includes('zod') || id.includes('auto-animate')) return 'v-utils';
            return 'v-vendor';
          }
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
        id: 'clash-manager-v11',
        name: 'Clash Manager',
        short_name: 'Clash Manager',
        theme_color: '#050505',
        background_color: '#050505',
        display: 'standalone',
        scope: '/Clash-Manager/',
        start_url: '/Clash-Manager/index.html',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,woff2}'],
        runtimeCaching: [
          {
            // ⚡ AGGRESSIVE FONT CACHING: Bypass the 5.4s download on repeat visits
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-stylesheets'
            }
          },
          {
            // API DATA: Network first, but cache for offline
            urlPattern: /^https:\/\/script\.google\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'gas-api-cache',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 10 }
            }
          }
        ]
      }
    }) as any
  ],
  base: '/Clash-Manager/'
})
