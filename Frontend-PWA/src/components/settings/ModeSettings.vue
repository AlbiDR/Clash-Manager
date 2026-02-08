<script setup lang="ts">
import { useSettings } from "../../composables/useSettings";
import SettingsCard from "../SettingsCard.vue";
import Icon from "../Icon.vue";

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
      <div
        class="toggle-row mini"
        :class="{
          disabled: isShowcaseMode,
          'active-row': isSyntheticMode && !isShowcaseMode,
        }"
        @click="!isShowcaseMode && toggleSyntheticMode()"
      >
        <div class="row-info">
          <div class="row-label">Synthetic Engine</div>
          <div class="row-desc">
            Populate the interface with high-fidelity mock data
          </div>
        </div>
        <div class="switch" :class="{ active: isSyntheticMode }">
          <div class="handle"></div>
        </div>
      </div>

      <!-- Blueprint Mode -->
      <div
        class="toggle-row mini"
        :class="{
          disabled: isShowcaseMode,
          'active-row': isBlueprintMode && !isShowcaseMode,
        }"
        @click="!isShowcaseMode && toggleBlueprintMode()"
      >
        <div class="row-info">
          <div class="row-label">Structural Blueprint</div>
          <div class="row-desc">
            Strip UI to geometric skeletons to audit layout stability
          </div>
        </div>
        <div class="switch" :class="{ active: isBlueprintMode }">
          <div class="handle"></div>
        </div>
      </div>

      <div class="mode-connector">
        <div class="connector-line"></div>
        <Icon name="expand" size="14" class="connector-icon" />
      </div>

      <!-- Master Showcase Group -->
      <div class="mode-master-container" :class="{ active: isShowcaseMode }">
        <div
          class="toggle-row"
          :class="{ 'active-row': isShowcaseMode }"
          @click="toggleShowcaseMode()"
        >
          <div class="row-info">
            <div class="row-label flex align-center gap-8">
              Master Showcase
              <span v-if="isShowcaseMode" class="hybrid-badge">HYBRID</span>
            </div>
            <div class="row-desc">
              A curated fusion environment leveraging both synthetic data and
              structural skeletons
            </div>
          </div>
          <div class="switch" :class="{ active: isShowcaseMode }">
            <div class="handle"></div>
          </div>
        </div>
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

.toggle-row.mini {
  padding-left: 8px;
  opacity: 1;
  margin-bottom: -4px;
}
.toggle-row.mini .row-label {
  font-size: 14px;
  font-weight: 700;
}
.toggle-row.mini .row-desc {
  font-size: 12px;
}
.toggle-row.mini .switch {
  transform: scale(0.85);
}
.toggle-row.mini.disabled {
  pointer-events: none;
  opacity: 0.5;
}

.mode-connector {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 8px;
  position: relative;
  margin: -4px 0;
}
.connector-line {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 28px;
  width: 1.5px;
  background: var(--sys-color-outline-variant);
  opacity: 0.1;
}
.connector-icon {
  color: var(--sys-color-outline-variant);
  opacity: 0.3;
  background: var(--sys-color-surface-container);
  z-index: 1;
  padding: 2px;
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
