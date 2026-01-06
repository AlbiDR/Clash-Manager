<script setup lang="ts">
import { computed } from "vue";
import { useApiState } from "../../composables/useApiState";
import SettingsCard from "../SettingsCard.vue";
import Icon from "../Icon.vue";

const { pingData, apiStatus } = useApiState();
const isChecking = computed(() => apiStatus.value === "checking");
</script>

<template>
  <SettingsCard title="System Modules" icon="box" :loading="isChecking">
    <div class="module-grid">
      <template v-if="isChecking">
        <div v-for="i in 6" :key="i" class="module-item skeleton-anim">
          <div class="sk-text-line-s" style="width: 70px"></div>
          <div class="sk-stat-value" style="width: 40px"></div>
        </div>
      </template>
      <template v-else-if="pingData?.modules">
        <div
          v-for="(ver, name) in pingData.modules"
          :key="name"
          class="module-item"
        >
          <span class="m-name">{{ name }}</span>
          <span class="m-ver">v{{ ver }}</span>
        </div>
      </template>
    </div>
  </SettingsCard>
</template>

<style scoped>
.module-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 12px;
  overflow: hidden;
}
.module-item {
  background: var(--sys-color-surface-container-high);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.m-name {
  font-size: 10px;
  font-weight: 800;
  opacity: 0.5;
  text-transform: uppercase;
}
.m-ver {
  font-size: 14px;
  font-weight: 700;
  font-family: var(--sys-font-family-mono);
  color: var(--sys-color-primary);
}
</style>
