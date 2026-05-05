<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->

<script setup lang="ts">
import { vTactile } from "../directives/vTactile";
import { useHaptics } from "@core";
import { computed } from "vue";
import type { HubInfo } from "@core/types";

const props = defineProps<{
  version: string;
  badge?: string;
  hubInfo?: HubInfo;
}>();

const haptics = useHaptics();

const handleReload = () => {
  haptics.heavy();
  window.location.reload();
};

const statusLabel = computed(() => {
  if (props.hubInfo?.source === "SUPABASE") return "Supabase Cluster";
  if (props.hubInfo?.source === "WORKER") return "Worker Hub";
  if (props.hubInfo?.source === "GAS") return "Legacy GAS (Fallback)";
  return "Disconnected";
});

const statusColor = computed(() => {
  if (props.hubInfo?.source === "SUPABASE") return "var(--sys-color-success)";
  if (props.hubInfo?.source === "WORKER") return "var(--sys-color-success)";
  if (props.hubInfo?.source === "GAS") return "var(--sys-color-primary)";
  return "var(--sys-color-error)";
});
</script>

<template>
  <div class="footer-info">
    <div v-if="props.hubInfo" class="hub-status">
      <span class="status-dot" :style="{ backgroundColor: statusColor }"></span>
      <span class="status-text">{{ statusLabel }}</span>
      <span v-if="props.hubInfo.hubAge" class="status-age">{{ props.hubInfo.hubAge }}</span>
    </div>

    <div
      class="brand"
      role="button"
      tabindex="0"
      @click="handleReload"
      @keydown.enter="handleReload"
      @keydown.space.prevent="handleReload"
      v-tactile
      v-bind="{ 'aria-label': 'Reload application' }"
    >
      CLASH MANAGER V{{ props.version }}
      <span v-if="props.badge" class="demo-tag">{{ props.badge }}</span>
    </div>
    <div class="copy">Copyright © 2026 AlbiDR</div>
  </div>
</template>

<style scoped>
.footer-info {
  padding: 40px 0;
  text-align: center;
  user-select: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.brand {
  font-size: 12px;
  font-weight: 950;
  opacity: 0.3;
  letter-spacing: 0.1em;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  transition: opacity 0.2s;
}

.brand:active {
  opacity: 0.6;
}

.demo-tag {
  background: var(--sys-color-primary);
  color: var(--sys-color-on-primary);
  font-size: 8px;
  padding: 2px 6px;
  border-radius: 4px;
  letter-spacing: 0;
  opacity: 1;
}

.copy {
  font-size: 10px;
  opacity: 0.2;
}

.hub-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  background: rgba(255, 255, 255, 0.03);
  padding: 4px 10px;
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  margin-bottom: 4px;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  box-shadow: 0 0 8px v-bind(statusColor);
  transition: background-color 0.3s, box-shadow 0.3s;
  animation: pulse 2s infinite;
}

.status-text {
  opacity: 0.6;
}

.status-age {
  opacity: 0.3;
  font-weight: 400;
  border-left: 1px solid rgba(255, 255, 255, 0.1);
  padding-left: 8px;
}

@keyframes pulse {
  0% { opacity: 1; }
  50% { opacity: 0.5; }
  100% { opacity: 1; }
}
</style>
