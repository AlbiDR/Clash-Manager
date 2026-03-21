<script setup lang="ts">
import { useHaptics } from "../../core/services/useHaptics";
import { computed } from "vue";

const props = defineProps<{
  type: "updated" | "error" | "loading" | "ready";
  text: string;
  hubInfo?: {
    source: "WORKER" | "GAS";
    hubAge: string | null;
  };
}>();

const emit = defineEmits<{
  refresh: [];
}>();

const haptics = useHaptics();

function handleRefresh() {
  if (props.type === "loading") return;
  haptics.tap();
  emit("refresh");
}

const displayStatusText = computed(() => {
  if (props.hubInfo?.source === "WORKER" && props.hubInfo.hubAge) {
    return `Hub: ${props.hubInfo.hubAge}`;
  }
  return props.text;
});

const indicatorColor = computed(() => {
  if (props.type === "error") return "var(--sys-color-error)";
  if (props.hubInfo?.source === "WORKER") return "var(--sys-color-success)";
  if (props.hubInfo?.source === "GAS") return "var(--sys-color-primary)";
  return "currentColor";
});
</script>

<template>
  <button
    class="status-pill hit-target"
    :class="[props.type, { 'is-refreshing': props.type === 'loading', 'is-worker': props.hubInfo?.source === 'WORKER' }]"
    @click="handleRefresh"
    aria-label="Refresh Data"
  >
    <div v-if="props.type === 'loading'" class="spinner"></div>
    <div 
      v-else 
      class="status-dot" 
      :style="{ backgroundColor: indicatorColor, boxShadow: props.hubInfo?.source === 'WORKER' ? '0 0 8px var(--sys-color-success)' : 'none' }"
    ></div>
    <span class="status-text">{{ displayStatusText }}</span>
  </button>
</template>

<style scoped>
.status-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: var(--sys-color-surface-container-high);
  border-radius: 99px;
  border: 1px solid var(--sys-surface-glass-border);
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.2s;
  color: var(--sys-color-on-surface-variant);
  flex-shrink: 0;
}

.status-pill:hover {
  background: var(--sys-color-surface-container-high);
  border-color: var(--sys-color-outline-variant);
}

.status-pill:active {
  transform: scale(0.94);
  background: var(--sys-color-surface-container-highest);
}

.status-pill.is-refreshing {
  pointer-events: none;
  opacity: 0.8;
}

/* Base states: fallback to semantic containers */
.status-pill.ready,
.status-pill.updated {
  color: var(--sys-color-success);
  background: var(--sys-color-success-container);
}

.status-pill.error {
  color: var(--sys-color-error);
  background: var(--sys-color-error-container);
}

/* Worker specific override: Glow and higher visibility */
.status-pill.is-worker {
  background: rgba(var(--sys-color-success-rgb), 0.15);
  border-color: rgba(var(--sys-color-success-rgb), 0.3);
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  transition: background-color 0.3s, box-shadow 0.3s;
}

.is-worker .status-dot {
  animation: pulse 2s infinite;
}

.spinner {
  width: 12px;
  height: 12px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes pulse {
  0% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.85); }
  100% { opacity: 1; transform: scale(1); }
}

@media (max-width: 600px) {
  .status-pill {
    padding: 6px 10px;
    gap: 6px;
    min-width: 60px;
  }
}
</style>
