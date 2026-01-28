<script setup lang="ts">
import { useAppSettings } from "../../composables/useAppSettings";
import { useClashData } from "../../composables/useClashData";
import SettingsCard from "../SettingsCard.vue";

const { modules, toggle } = useAppSettings();
const { isRefreshing } = useClashData();
</script>

<template>
  <SettingsCard
    title="Application Features"
    icon="analytics"
    :loading="isRefreshing"
  >
    <div class="features-list">
      <div
        class="toggle-row"
        :class="{ 'active-row': modules.ghostBenchmarking }"
        @click="toggle('ghostBenchmarking')"
      >
        <div class="row-info">
          <div class="row-label">Ghost Benchmarking</div>
          <div class="row-desc">
            Visualize clan averages inside stat tooltips
          </div>
        </div>
        <div
          class="switch"
          :class="{
            active: modules.ghostBenchmarking,
            'skeleton-anim sk-badge-s': isRefreshing,
          }"
        >
          <div class="handle"></div>
        </div>
      </div>

      <div
        class="toggle-row"
        :class="{ 'active-row': modules.sortExplanation }"
        @click="toggle('sortExplanation')"
      >
        <div class="row-info">
          <div class="row-label">Sorting Descriptions</div>
          <div class="row-desc">Explain the logic behind sorting heuristics</div>
        </div>
        <div
          class="switch"
          :class="{
            active: modules.sortExplanation,
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
  transition:
    color 0.25s cubic-bezier(0.4, 0, 0.2, 1),
    opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.row-desc {
  font-size: 13px;
  opacity: 0.5;
  color: var(--sys-color-outline);
  transition:
    color 0.25s cubic-bezier(0.4, 0, 0.2, 1),
    opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1);
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
