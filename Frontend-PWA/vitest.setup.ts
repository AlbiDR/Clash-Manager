import { config } from '@vue/test-utils'

// Global mocks or config
config.global.mocks = {
    $t: (msg: string) => msg
}

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: any) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => { }, // Deprecated
        removeListener: () => { }, // Deprecated
        addEventListener: () => { },
        removeEventListener: () => { },
        dispatchEvent: () => { },
    }),
})

// Mock localStorage
const localStorageMock = (function () {
    let store: Record<string, string> = {}
    return {
        getItem: (key: string) => store[key] || null,
        setItem: (key: string, value: string) => { store[key] = value.toString() },
        removeItem: (key: string) => { delete store[key] },
        clear: () => { store = {} },
        key: (index: number) => Object.keys(store)[index] || null,
        length: 0
    }
})()
Object.defineProperty(window, 'localStorage', { value: localStorageMock })
