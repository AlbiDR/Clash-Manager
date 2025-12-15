// Replacement for vite/client types to fix resolution error

interface ImportMetaEnv {
    readonly VITE_GAS_URL: string
    readonly BASE_URL: string
    readonly MODE: string
    readonly DEV: boolean
    readonly PROD: boolean
    readonly SSR: boolean
    [key: string]: any
}

interface ImportMeta {
    readonly url: string
    readonly env: ImportMetaEnv
}

declare module '*.vue' {
    import type { DefineComponent } from 'vue'
    const component: DefineComponent<{}, {}, any>
    export default component
}

declare module '*.css' {}
