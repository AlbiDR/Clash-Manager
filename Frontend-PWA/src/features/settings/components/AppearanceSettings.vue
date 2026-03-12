<script setup lang="ts">
import { Icon, SettingRow } from "@shared";
import { useSettings } from "../composables/useSettings";
import SettingsCard from "./SettingsCard.vue";
defineProps<{
  initiallyExpanded?: boolean;
}>();

const { theme, wakeLock, isRefreshing, handleThemeChange } = useSettings();
</script>

<template>
  <SettingsCard title="Appearance & Utility" icon="gear" :initially-expanded="initiallyExpanded">
    <div class="theme-selection-area">
      <div class="theme-label-group">
        <span class="theme-main-label">System Theme</span>
        <span class="theme-sub-label">Adaptive Mode Control</span>
      </div>

      <div class="theme-switch-container">
        <button
          class="theme-option"
          :class="{ active: theme === 'light' }"
          @click="handleThemeChange('light')"
          aria-label="Light Theme"
        >
          <div class="option-icon-box">
             <Icon name="theme_light" size="18" />
          </div>
          <span class="option-name">Light</span>
        </button>

        <button
          class="theme-option"
          :class="{ active: theme === 'auto' }"
          @click="handleThemeChange('auto')"
          aria-label="Auto Theme"
        >
          <div class="option-icon-box">
            <Icon name="theme_auto" size="18" />
          </div>
          <span class="option-name">Auto</span>
        </button>

        <button
          class="theme-option"
          :class="{ active: theme === 'dark' }"
          @click="handleThemeChange('dark')"
          aria-label="Dark Theme"
        >
          <div class="option-icon-box">
            <Icon name="moon" size="18" />
          </div>
          <span class="option-name">Dark</span>
        </button>

        <div class="selection-slider" :class="`pos-${theme}`" />
      </div>
    </div>

    <div class="features-list" style="margin-top: 24px">
      <SettingRow
        v-if="wakeLock.isSupported"
        label="Keep Screen On"
        description="Prevent display sleep during clan management"
        :active="wakeLock.isActive.value"
        :loading="isRefreshing"
        @click="wakeLock.toggle()"
      />
    </div>
  </SettingsCard>
</template>

<style scoped>
.theme-selection-area {
  display: flex;
  flex-direction: column; /* Restored Vertical Stack */
  gap: 12px; /* Tight gap */
  background: var(--sys-color-surface-container-low);
  padding: 14px 16px; /* Optimized cushion */
  border-radius: 20px;
  border: 1px solid var(--sys-surface-glass-border);
  position: relative;
  overflow: hidden;
}

.theme-label-group {
  display: flex;
  flex-direction: column;
}

.theme-main-label {
  font-size: 14px;
  font-weight: 900;
  color: var(--sys-color-on-surface);
  letter-spacing: -0.01em;
}

.theme-sub-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--sys-color-outline);
  opacity: 0.6;
}

.theme-switch-container {
  display: flex;
  position: relative;
  background: var(--sys-color-surface-container-highest);
  padding: 4px;
  border-radius: 999px;
  isolation: isolate;
  gap: 4px;
  width: 100%; /* Full Horizontal Span */
}

.theme-option {
  flex: 1;
  position: relative;
  z-index: 2;
  border: none;
  background: transparent;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 10px 0; /* Balanced height */
  cursor: pointer;
  transition: all 0.4s var(--sys-motion-spring);
  color: var(--sys-color-outline);
}

.option-icon-box {
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.4s var(--sys-motion-spring);
}

.option-name {
  font-size: 9px;
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  opacity: 0.5;
}

.theme-option.active {
  color: var(--sys-color-on-primary-container);
}

.theme-option.active .option-name {
  opacity: 1;
}

.theme-option.active .option-icon-box {
  transform: translateY(-1px) scale(1.05);
}

.selection-slider {
  position: absolute;
  top: 4px;
  bottom: 4px;
  left: 4px;
  width: calc(33.333% - 5.333px);
  background: var(--sys-color-primary-container);
  border-radius: 999px;
  z-index: 1;
  transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  border: 1px solid rgba(var(--sys-color-primary-rgb), 0.1);
}

.pos-light { transform: translateX(0); }
.pos-auto  { transform: translateX(calc(100% + 4px)); }
.pos-dark  { transform: translateX(calc(200% + 8px)); }

.features-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
</style>
