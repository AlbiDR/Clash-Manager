// Removed missing reference to vite/client
// /// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_GAS_URL: string
    [key: string]: any
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}

declare module '*.vue' {
    import type { DefineComponent } from 'vue'
    const component: DefineComponent<{}, {}, any>
    export default component
}
