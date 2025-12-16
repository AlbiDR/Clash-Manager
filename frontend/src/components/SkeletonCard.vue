<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  index?: number
}>()

// Deterministic variation based on index
const nameWidth = computed(() => {
  if (props.index === undefined) return '60%'
  const widths = ['55%', '70%', '45%', '65%', '50%', '75%']
  return widths[props.index % widths.length]
})

const metaWidth = computed(() => {
  if (props.index === undefined) return '40%'
  const widths = ['35%', '45%', '30%', '40%', '38%', '42%']
  return widths[props.index % widths.length]
})
</script>

<template>
  <div class="skeleton-card">
    <div class="skeleton-header">
      <div class="info-stack">
        <div class="sk-bar name-bar" :style="{ width: nameWidth }"></div>
        <div class="sk-bar meta-bar" :style="{ width: metaWidth }"></div>
      </div>
      <div class="action-area">
        <div class="sk-box stat-pod"></div>
        <div class="sk-circle chevron"></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.skeleton-card {
  background: var(--sys-color-surface-container);
  border-radius: 16px; /* Matched radius */
  padding: 8px 12px; /* Matched strict padding */
  margin-bottom: 6px;
  border: 1px solid transparent;
  height: 58px; /* 40px Header + 16px Padding + 2px Border approx */
  box-sizing: border-box;
  overflow: hidden;
  position: relative;
}

/* Shimmer Effect */
.skeleton-card::after {
  content: "";
  position: absolute;
  top: 0; right: 0; bottom: 0; left: 0;
  transform: translateX(-100%);
  background-image: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0) 0,
    rgba(255, 255, 255, 0.05) 20%,
    rgba(255, 255, 255, 0.1) 60%,
    rgba(255, 255, 255, 0)
  );
  animation: shimmer 2s infinite;
}

.skeleton-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 40px; /* Locked Height */
}

.info-stack {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
}

.action-area {
  display: flex;
  align-items: center;
  gap: 10px;
}

.sk-bar {
  background: var(--sys-color-surface-container-highest);
  border-radius: 4px;
  transition: width 0.2s ease;
}

.name-bar {
  height: 16px;
}

.meta-bar {
  height: 12px;
}

.sk-box {
  background: var(--sys-color-surface-container-highest);
  border-radius: 12px;
}

.stat-pod {
  width: 40px; /* Matched new size */
  height: 40px; /* Matched new size */
}

.sk-circle {
  background: var(--sys-color-surface-container-highest);
  border-radius: 50%;
}

.chevron {
  width: 18px;
  height: 18px;
}

@keyframes shimmer {
  100% {
    transform: translateX(100%);
  }
}
</style>
