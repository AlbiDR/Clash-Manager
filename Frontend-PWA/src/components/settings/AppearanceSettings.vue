<script setup lang="ts">
import { useTheme } from '../../composables/useTheme'
import { useHaptics } from '../../composables/useHaptics'
import SettingsCard from '../SettingsCard.vue'
import Icon from '../Icon.vue'

const { theme, setTheme } = useTheme()
const haptics = useHaptics()

function handleThemeChange(newTheme: any) {
    haptics.tap()
    setTheme(newTheme)
}
</script>

<template>
    <SettingsCard title="Appearance" icon="gear">
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
    </SettingsCard>
</template>

<style scoped>
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
