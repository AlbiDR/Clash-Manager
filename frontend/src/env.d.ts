/**
 * TypeScript Environment Definitions
 * Defines the shape of import.meta.env and handles static assets.
 */

// /// <reference types="vite/client" />

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

// Static asset declarations
declare module '*.svg' { const content: string; export default content; }
declare module '*.png' { const content: string; export default content; }
declare module '*.jpg' { const content: string; export default content; }
declare module '*.jpeg' { const content: string; export default content; }
declare module '*.gif' { const content: string; export default content; }
declare module '*.webp' { const content: string; export default content; }
declare module '*.ico' { const content: string; export default content; }
