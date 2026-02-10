import { Icon, vTactile , ConsoleLayout, ConsoleHeader, FloatingDock, HeaderInfoOverlay } from "@shared";
<script setup lang="ts">
import { useSettings } from "../composables/useSettings";
import SettingsCard from "./SettingsCard.vue";
defineProps<{
  initiallyExpanded?: boolean;
}>();

const {
  modules,
  toggle,
  isRefreshing,
  forceUpdate,
  clearCache,
  factoryReset,
} = useSettings();
</script>

<template>
  <SettingsCard title="System & Recovery" icon="gear" :initially-expanded="initiallyExpanded">
    <template #header-extra>
      <span class="exp-badge">EXPERIMENTAL</span>
    </template>

    <div class="features-list">
      <div
        class="toggle-row"
        :class="{ 'active-row': modules.blitzMode }"
        @click="toggle('blitzMode')"
      >
        <div class="row-info">
          <div class="row-label flex align-center gap-8">Blitz Mode</div>
          <div class="row-desc">Batch operations without confirmation</div>
        </div>
        <div
          class="switch"
          :class="{
            active: modules.blitzMode,
            'skeleton-anim sk-badge-s': isRefreshing,
          }"
        >
          <div class="handle"></div>
        </div>
      </div>
    </div>

    <div class="card-divider-s" />

    <div class="trouble-grid">
      <button class="trouble-btn" @click="forceUpdate" v-tactile>
        <Icon name="download_done" size="18" />
        <span>Force Update</span>
      </button>

      <button class="trouble-btn" @click="clearCache" v-tactile>
        <Icon name="layers_clear" size="18" />
        <span>Purge Assets</span>
      </button>

      <button class="trouble-btn danger" @click="factoryReset" v-tactile>
        <Icon name="restore" size="18" />
        <span>Factory Reset</span>
      </button>
    </div>
  </SettingsCard>
</template>

<style scoped>
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

.exp-badge {
  font-size: 9px;
  font-weight: 900;
  color: var(--sys-color-primary);
  background: var(--sys-color-surface-container-highest);
  padding: 2px 6px;
  border-radius: 4px;
  letter-spacing: 0.05em;
}
.card-divider-s {
  height: 1.5px;
  background: var(--sys-color-outline-variant);
  opacity: 0.1;
  margin: 20px 0;
}

.trouble-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.trouble-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  height: 44px;
  background: var(--sys-color-surface-container-high);
  border: none;
  border-radius: 12px;
  color: var(--sys-color-primary);
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.2s;
}
.trouble-btn:active {
  transform: scale(0.98);
  opacity: 0.8;
}
.trouble-btn.danger {
  color: var(--sys-color-error);
}

.flex {
  display: flex;
}
.align-center {
  align-items: center;
}
.gap-8 {
  gap: 8px;
}
</style>
