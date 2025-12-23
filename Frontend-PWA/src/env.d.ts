/**
 * TypeScript Environment Definitions
 * Defines the shape of import.meta.env and handles static assets.
 */

/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GAS_URL: string
}

declare const __APP_VERSION__: string

declare module '*.vue' {
  const component: any
  export default component
}

declare module '*.css' {
  const content: string
  export default content
}
