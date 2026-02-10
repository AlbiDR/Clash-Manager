import { Icon } from "@shared";
<script setup lang="ts">
import { useSettings } from "../../composables/useSettings";
import SettingsCard from "../SettingsCard.vue";
defineProps<{
  initiallyExpanded?: boolean;
}>();

const { theme, wakeLock, isRefreshing, handleThemeChange } = useSettings();
</script>

<template>
  <SettingsCard title="Appearance & Utility" icon="gear" :initially-expanded="initiallyExpanded">
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
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s var(--sys-motion-spring);
}
.theme-btn.active {
  background: var(--sys-color-primary);
  color: var(--sys-color-on-primary);
  box-shadow: 0 4px 12px rgba(var(--sys-color-primary-rgb), 0.2);
}

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
