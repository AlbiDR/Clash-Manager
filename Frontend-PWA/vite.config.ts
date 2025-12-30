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
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor': ['vue', 'vue-router', '@formkit/auto-animate'],
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
      includeAssets: [
        'favicon.png',
        'apple-touch-icon.png',
        'logo.png',
        'maskable-icon-512x512.png',
        'monochrome-icon-512x512.png'
      ],
      manifest: {
        id: '/Clash-Manager/',
        name: 'Clash Manager',
        short_name: 'Clash Manager',
        description: 'Advanced analytics and recruitment tool for Clash Royale clans',
        theme_color: '#0b0e14',
        background_color: '#0b0e14',
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone', 'fullscreen', 'minimal-ui'],
        orientation: 'portrait-primary',
        scope: '/Clash-Manager/',
        start_url: '/Clash-Manager/index.html',
        categories: ['productivity', 'utilities', 'games'],
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            src: 'monochrome-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'monochrome'
          }
        ],
        shortcuts: [
          {
            name: 'Leaderboard',
            short_name: 'Leaderboard',
            description: 'View clan member rankings',
            url: '/Clash-Manager/index.html#/leaderboard',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }]
          },
          {
            name: 'Recruits',
            short_name: 'Recruits',
            description: 'Browse potential recruits',
            url: '/Clash-Manager/index.html#/recruiter',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }]
          }
        ],
        screenshots: [
          {
            src: 'screenshot-mobile.png',
            sizes: '1080x1920',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'Clash Manager Mobile Dashboard'
          },
          {
            src: 'screenshot-desktop.png',
            sizes: '1920x1080',
            type: 'image/png',
            form_factor: 'wide',
            label: 'Clash Manager Desktop Analytics'
          }
        ],
        file_handlers: [
          {
            action: '/Clash-Manager/',
            accept: {
              'application/json': ['.clashmgr', '.json']
            },
            icons: [
              {
                src: 'pwa-192x192.png',
                sizes: '192x192',
                type: 'image/png'
              }
            ],
            launch_type: 'single-client'
          }
        ],
        protocol_handlers: [
          {
            protocol: 'web+cm',
            url: '/Clash-Manager/?p=%s'
          },
          {
            protocol: 'web+clashroyale',
            url: '/Clash-Manager/?cr=%s'
          }
        ],
        related_applications: [
          {
            platform: 'play',
            url: 'https://play.google.com/store/apps/details?id=com.albidr.clashmanager',
            id: 'com.albidr.clashmanager'
          },
          {
            platform: 'webapp',
            url: 'https://albidr.github.io/Clash-Manager/manifest.webmanifest'
          }
        ],
        widgets: [
          {
            name: 'Clan Status',
            short_name: 'Status',
            description: 'Quick view of clan performance',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
            ms_widget: {
              template: 'widget-template.json',
              data: 'widget-data.json',
              type: 'text/json'
            }
          }
        ],
        edge_side_panel: {
          preferred_width: 400
        },
        note_taking: {
          new_note_url: '/Clash-Manager/index.html#/notes'
        },
        scope_extensions: [
          { origin: 'https://albidr.github.io' },
          { origin: 'https://clashroyale.com' }
        ],
        share_target: {
          action: '/Clash-Manager/share',
          method: 'GET',
          params: {
            title: 'title',
            text: 'text',
            url: 'url'
          }
        },
        launch_handler: {
          client_mode: 'navigate-existing'
        },
        iarc_rating_id: 'e58c704a-579c-4f01-831e-45814545d625',
        lang: 'en-US',
        dir: 'ltr',
        prefer_related_applications: false
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,woff2}'],
        additionalManifestEntries: [],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        importScripts: ['sw-badge-handler.js'],
        // 🔒 SECURITY: Force a manifest revision update on every build to trigger WebAPK refresh
        manifestTransforms: [
          (manifestEntries) => {
            const timestamp = new Date().getTime();
            const manifest = manifestEntries.map((entry) => {
              if (entry.url === 'manifest.webmanifest' || entry.url === 'index.html') {
                entry.revision = `${entry.revision || 'v1'}-${timestamp}`;
              }
              return entry;
            });
            return { manifest, warnings: [] };
          }
        ],
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
