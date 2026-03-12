<script setup lang="ts">
import { Icon, SettingRow, vTactile } from "@shared";
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
      <SettingRow
        label="Blitz Mode"
        description="Batch operations without confirmation"
        :active="modules.blitzMode"
        :loading="isRefreshing"
        @click="toggle('blitzMode')"
      />
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
