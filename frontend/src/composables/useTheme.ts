
import { ref, watch } from 'vue'

export type Theme = 'light' | 'dark' | 'auto'

const STORAGE_KEY = 'cm_theme_preference'
const theme = ref<Theme>('auto')
const isInitialized = ref(false)

export function useTheme() {
  const mediaQuery = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null

  function applyTheme() {
    if (typeof document === 'undefined' || !mediaQuery) return

    const root = document.documentElement
    const isDark = theme.value === 'auto' 
      ? mediaQuery.matches 
      : theme.value === 'dark'

    if (isDark) {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
    
    // Update PWA theme color meta tag to match the new background
    // Colors derived from style.css: #0b0e14 (dark) / #fdfcff (light)
    const metaThemeColor = document.querySelector('meta[name="theme-color"]')
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', isDark ? '#0b0e14' : '#fdfcff')
    }
  }

  function setTheme(newTheme: Theme) {
    theme.value = newTheme
    localStorage.setItem(STORAGE_KEY, newTheme)
    applyTheme()
  }

  function init() {
    if (isInitialized.value || typeof window === 'undefined') return
    
    const cached = localStorage.getItem(STORAGE_KEY) as Theme | null
    if (cached && ['light', 'dark', 'auto'].includes(cached)) {
      theme.value = cached
    }
    
    // Listener for system changes to auto-update when in 'auto' mode
    if (mediaQuery) {
        mediaQuery.addEventListener('change', () => {
            if (theme.value === 'auto') applyTheme()
        })
    }
    
    applyTheme()
    isInitialized.value = true
  }

  return {
    theme,
    setTheme,
    init
  }
}
