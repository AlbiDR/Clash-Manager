
/**
 * TypeScript Environment Definitions
 * Defines the shape of import.meta.env and handles static assets.
 */

// Fix: Removed problematic vite/client reference as it cannot be found and manually added BASE_URL 
// to ImportMetaEnv to resolve "Property 'BASE_URL' does not exist" error in router/index.ts
interface ImportMetaEnv {
  readonly VITE_GAS_URL: string
  readonly BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

// Added asset declarations typically provided by vite/client to maintain compatibility
declare module '*.svg' {
  const content: string
  export default content
}

declare module '*.png' {
  const content: string
  export default content
}

declare module '*.jpg' {
  const content: string
  export default content
}

declare module '*.jpeg' {
  const content: string
  export default content
}
