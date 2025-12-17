/**
 * TypeScript Environment Definitions
 * Defines the shape of import.meta.env and handles static assets.
 */

interface ImportMetaEnv {
  readonly VITE_GAS_URL: string
  readonly BASE_URL: string
  readonly MODE: string
  readonly DEV: boolean
  readonly PROD: boolean
  readonly SSR: boolean
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}
