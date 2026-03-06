<script setup lang="ts">
import { Icon } from "@shared";
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
      <div
        v-if="wakeLock.isSupported"
        class="toggle-row"
        :class="{ 'active-row': wakeLock.isActive.value }"
        @click="wakeLock.toggle()"
      >
        <div class="row-info">
          <div class="row-label">Keep Screen On</div>
          <div class="row-desc">
            Prevent display sleep during clan management
          </div>
        </div>
        <div
          class="switch"
          :class="{
            active: wakeLock.isActive.value,
            'skeleton-anim sk-badge-s': isRefreshing,
          }"
        >
          <div class="handle"></div>
        </div>
      </div>
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
.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
}
.row-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}
.row-label {
  font-weight: 800;
  font-size: 15px;
  color: var(--sys-color-outline);
  opacity: 0.5;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.row-desc {
  font-size: 13px;
  opacity: 0.5;
  color: var(--sys-color-outline);
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.toggle-row.active-row .row-label {
  color: var(--sys-color-on-surface);
  opacity: 1;
}
.toggle-row.active-row .row-desc {
  color: var(--sys-color-on-surface);
  opacity: 0.8;
}

.switch {
  width: 44px;
  height: 24px;
  background: var(--sys-color-surface-container-highest);
  border-radius: 12px;
  position: relative;
  transition: 0.3s;
  border: 1.5px solid rgba(0, 0, 0, 0.1);
}
.switch.active {
  background: var(--sys-color-primary);
}
.switch .handle {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 17px;
  height: 17px;
  background: white;
  border-radius: 50%;
  transition: 0.3s;
}
.switch.active .handle {
  left: calc(100% - 19px);
}
</style>
