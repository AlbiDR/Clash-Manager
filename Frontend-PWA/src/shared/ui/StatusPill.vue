<script setup lang="ts">
import { useHaptics } from "@core/services/useHaptics";
const props = defineProps<{
  type: "updated" | "error" | "loading" | "ready";
  text: string;
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
</script>

<template>
  <button
    class="status-pill hit-target"
    :class="[type, { 'is-refreshing': type === 'loading' }]"
    @click="handleRefresh"
    aria-label="Refresh Data"
  >
    <div v-if="type === 'loading'" class="spinner"></div>
    <div v-else class="status-dot"></div>
    <span class="status-text">{{ text }}</span>
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

.status-pill.ready,
.status-pill.updated {
  color: var(--sys-color-success);
  background: var(--sys-color-success-container);
}

.status-pill.error {
  color: var(--sys-color-error);
  background: var(--sys-color-error-container);
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
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

@media (max-width: 600px) {
  .status-pill {
    padding: 6px 10px;
    gap: 6px;
    min-width: 60px;
  }
}
</style>
