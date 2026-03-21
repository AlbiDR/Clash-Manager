<script setup lang="ts">
import { vTactile } from "../directives/vTactile";
import { useHaptics } from "@core";
import { computed } from "vue";

const props = defineProps<{
  version: string;
  badge?: string;
  currentSource?: "WORKER" | "GAS" | null;
  hubSyncTime?: number | null;
}>();

const haptics = useHaptics();

const handleReload = () => {
  haptics.heavy();
  window.location.reload();
};

const statusLabel = computed(() => {
  if (props.currentSource === "WORKER") return "Worker Hub (0ms)";
  if (props.currentSource === "GAS") return "Legacy GAS (Fallback)";
  return "Disconnected";
});

const statusColor = computed(() => {
  if (props.currentSource === "WORKER") return "var(--sys-color-success)";
  if (props.currentSource === "GAS") return "var(--sys-color-primary)";
  return "var(--sys-color-error)";
});

const hubAge = computed(() => {
  if (!props.hubSyncTime) return "";
  const minutes = Math.floor((Date.now() - props.hubSyncTime) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ago`;
  return `${minutes}m ago`;
});
</script>

<template>
  <div class="footer-info">
    <div v-if="props.currentSource" class="hub-status">
      <span class="status-dot" :style="{ backgroundColor: statusColor }"></span>
      <span class="status-text">{{ statusLabel }}</span>
      <span v-if="props.hubSyncTime" class="status-age">{{ hubAge }}</span>
    </div>

    <div
      class="brand"
      @click="handleReload"
      v-tactile
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
