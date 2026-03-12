<script setup lang="ts">
import { Icon, SettingRow } from "@shared";
import { useSettings } from "../composables/useSettings";
import SettingsCard from "./SettingsCard.vue";
defineProps<{
  initiallyExpanded?: boolean;
}>();

const {
  isSyntheticMode,
  toggleSyntheticMode,
  isBlueprintMode,
  toggleBlueprintMode,
  isShowcaseMode,
  toggleShowcaseMode,
  isRefreshing,
} = useSettings();
</script>

<template>
  <SettingsCard
    title="Display Preferences"
    icon="visibility"
    :loading="isRefreshing"
    :initially-expanded="initiallyExpanded"
  >
    <div class="features-list">
      <SettingRow
        label="Synthetic Engine"
        description="Populate the interface with high-fidelity mock data"
        :active="isSyntheticMode"
        :disabled="isShowcaseMode"
        mini
        @click="toggleSyntheticMode"
      />

      <!-- Blueprint Mode -->
      <SettingRow
        label="Structural Blueprint"
        description="Strip UI to geometric skeletons to audit layout stability"
        :active="isBlueprintMode"
        :disabled="isShowcaseMode"
        mini
        @click="toggleBlueprintMode"
      />

      <!-- Master Showcase Group -->
      <div class="mode-master-container" :class="{ active: isShowcaseMode }">
        <SettingRow
          :active="isShowcaseMode"
          @click="toggleShowcaseMode"
        >
          <template #label>
            <div class="flex align-center gap-8">
              Master Showcase
              <span v-if="isShowcaseMode" class="hybrid-badge">HYBRID</span>
            </div>
          </template>
          <template #description>
            A curated fusion environment leveraging both synthetic data and
            structural skeletons
          </template>
        </SettingRow>
      </div>
    </div>
  </SettingsCard>
</template>

<style scoped>
.features-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}



.mode-master-container {
  padding: 8px 12px;
  margin: -8px -2px 0;
  border-radius: 16px;
  background: var(--sys-color-surface-container-highest);
  border: 1px solid transparent;
  transition: all 0.3s var(--sys-motion-spring);
}
.mode-master-container.active {
  background: var(--sys-color-primary-container);
  border-color: rgba(var(--sys-color-primary-rgb), 0.2);
  box-shadow: var(--sys-elevation-1);
}
.mode-master-container.active .toggle-row .row-label {
  color: var(--sys-color-on-primary-container) !important;
}
.mode-master-container.active .toggle-row .row-desc {
  color: var(--sys-color-on-primary-container) !important;
  opacity: 0.7;
}

.hybrid-badge {
  font-size: 9px;
  font-weight: 950;
  background: var(--sys-color-primary);
  color: var(--sys-color-on-primary);
  padding: 2px 6px;
  border-radius: 99px;
  letter-spacing: 0.04em;
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
