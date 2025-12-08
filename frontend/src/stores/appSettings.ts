import { reactive, watch } from 'vue'

interface ModuleSettings {
  warLog: boolean
}

interface AppSettings {
  modules: ModuleSettings
}

const STORAGE_KEY = 'clash_manager_settings'

const defaultSettings: AppSettings = {
  modules: {
    warLog: true
  }
}

function loadSettings(): AppSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      return {
        modules: {
          ...defaultSettings.modules,
          ...parsed.modules
        }
      }
    }
  } catch (e) {
    console.warn('Failed to load settings:', e)
  }
  return { ...defaultSettings }
}

function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch (e) {
    console.warn('Failed to save settings:', e)
  }
}

export const appSettings = reactive<AppSettings>(loadSettings())

watch(
  () => appSettings,
  (newSettings) => {
    saveSettings(newSettings)
  },
  { deep: true }
)

export function getModuleEnabled(name: keyof ModuleSettings): boolean {
  return appSettings.modules[name] ?? false
}

export function setModuleEnabled(name: keyof ModuleSettings, value: boolean): void {
  appSettings.modules[name] = value
}

export function getAllModules(): ModuleSettings {
  return { ...appSettings.modules }
}
