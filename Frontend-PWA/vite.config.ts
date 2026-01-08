import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
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
  // Use root path '/' for Tauri to ensure assets load correctly.
  base: '/',
  build: {
    outDir: 'dist',
    sourcemap: false,
    cssCodeSplit: true,
    target: 'chrome100',
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
    tailwindcss() as any
  ]
})
