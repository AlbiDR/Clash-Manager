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
  border-radius: var(--shape-corner-l);
  padding: var(--spacing-s) var(--spacing-m);
  margin-bottom: var(--spacing-xs);
  border: 1px solid transparent;
  height: 90px;
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
  height: 100%;
}

.info-stack {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.action-area {
  display: flex;
  align-items: center;
  gap: var(--spacing-s);
}

.sk-bar {
  background: var(--sys-color-surface-container-highest);
  border-radius: 4px;
  transition: width 0.2s ease; /* Smooth if reused */
}

.name-bar {
  height: 20px;
  /* width set by inline style */
}

.meta-bar {
  height: 14px;
  /* width set by inline style */
}

.sk-box {
  background: var(--sys-color-surface-container-highest);
  border-radius: 20px;
}

.stat-pod {
  width: 64px;
  height: 64px;
}

.sk-circle {
  background: var(--sys-color-surface-container-highest);
  border-radius: 50%;
}

.chevron {
  width: 32px;
  height: 32px;
}

@keyframes shimmer {
  100% {
    transform: translateX(100%);
  }
}
</style>
