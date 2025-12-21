<script setup lang="ts">
import { useTheme } from '../../composables/useTheme'
import { useHaptics } from '../../composables/useHaptics'
import Icon from '../Icon.vue'

const { theme, setTheme } = useTheme()
const haptics = useHaptics()

function handleThemeChange(newTheme: any) {
    haptics.tap()
    setTheme(newTheme)
}
</script>

<template>
    <div class="settings-card">
        <div class="card-header">
            <Icon name="gear" size="20" class="header-icon" />
            <h3>Appearance</h3>
        </div>
        <div class="card-body">
            <div class="theme-switch">
                <button 
                    class="theme-btn" 
                    :class="{ active: theme === 'light' }" 
                    @click="handleThemeChange('light')"
                    title="Light Mode"
                >
                    <Icon name="theme_light" size="20" />
                </button>
                <button 
                    class="theme-btn" 
                    :class="{ active: theme === 'auto' }" 
                    @click="handleThemeChange('auto')"
                    title="Auto / System"
                >
                    <Icon name="theme_auto" size="20" />
                </button>
                <button 
                    class="theme-btn" 
                    :class="{ active: theme === 'dark' }" 
                    @click="handleThemeChange('dark')"
                    title="Dark Mode"
                >
                    <Icon name="moon" size="20" />
                </button>
            </div>
        </div>
    </div>
</template>

<style scoped>
.settings-card {
  background: var(--sys-color-surface-container);
  border-radius: 24px;
  border: 1px solid var(--sys-surface-glass-border);
  overflow: hidden;
  transition: background-color 0.3s ease;
}

.card-header {
  padding: 16px 20px;
  display: flex; align-items: center; gap: 12px;
  border-bottom: 1px solid rgba(0,0,0,0.05);
}
.card-header h3 { margin: 0; font-size: 16px; font-weight: 850; color: var(--sys-color-on-surface); }
.header-icon { color: var(--sys-color-primary); }

.card-body { padding: 20px; }

/* THEME SWITCH */
.theme-switch {
  display: flex;
  background: var(--sys-color-surface-container-high);
  padding: 4px;
  border-radius: 99px;
  gap: 4px;
}
.theme-btn {
  flex: 1;
  height: 40px;
  border: none;
  background: transparent;
  color: var(--sys-color-outline);
  border-radius: 99px;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.2s var(--sys-motion-spring);
}
.theme-btn.active {
  background: var(--sys-color-primary);
  color: var(--sys-color-on-primary);
  box-shadow: 0 4px 12px rgba(var(--sys-color-primary-rgb), 0.2);
}
</style>
