
<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  index?: number // For subtle variations
}>()

const titleWidth = computed(() => {
  if (props.index === undefined) return '160px'
  const widths = ['160px', '140px', '180px']
  return widths[props.index % widths.length]
})

const descWidth = computed(() => {
  if (props.index === undefined) return '200px'
  const widths = ['200px', '180px', '220px', '190px']
  return widths[props.index % widths.length]
})

const toggleWidth = computed(() => {
  if (props.index === undefined) return '44px'
  const widths = ['44px', '50px'] // For button-like elements
  return widths[props.index % widths.length]
})
</script>

<template>
  <div class="settings-card skeleton-anim">
    <div class="card-header">
      <div class="sk-icon-small"></div> <!-- Placeholder for header icon -->
      <div class="sk-line-m" :style="{ width: titleWidth }"></div> <!-- Placeholder for header title -->
    </div>
    <div class="card-body">
      <div class="features-list">
        <div class="toggle-row">
          <div class="row-info">
            <div class="sk-line-m-w" :style="{ width: descWidth }"></div>
            <div class="sk-line-s-w" :style="{ width: `calc(${descWidth} * 0.7)` }"></div>
          </div>
          <div class="sk-badge-s" :style="{ width: toggleWidth }"></div>
        </div>
        <div class="toggle-row">
          <div class="row-info">
            <div class="sk-line-m-w" :style="{ width: `calc(${descWidth} * 0.9)` }"></div>
            <div class="sk-line-s-w" :style="{ width: `calc(${descWidth} * 0.6)` }"></div>
          </div>
          <div class="sk-badge-s" :style="{ width: toggleWidth }"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-card {
  background: var(--sys-color-surface-container);
  border-radius: 24px;
  border: 1px solid var(--sys-surface-glass-border);
  overflow: hidden;
  
  /* CLS Fix: Min height to prevent layout shifts */
  min-height: 180px; /* Roughly the height of a typical settings card */

  /* Inherit global skeleton animation */
  animation: pulse 1.5s infinite ease-in-out;
}

.card-header {
  padding: 16px 20px;
  display: flex; align-items: center; gap: 12px;
  border-bottom: 1px solid rgba(0,0,0,0.05);
}

.sk-icon-small {
  width: 20px; height: 20px;
  background: var(--sh-sk-secondary);
  border-radius: 4px; /* Square for settings icons */
}

.sk-line-m {
  height: 16px; /* Matches h3 font size */
  background: var(--sh-sk);
  border-radius: 4px;
  flex: 1; /* Allows it to take available space */
}

.card-body { padding: 20px; }

.features-list { display: flex; flex-direction: column; gap: 16px; }
.toggle-row { display: flex; align-items: center; justify-content: space-between; }

.row-info { display: flex; flex-direction: column; gap: 4px; flex: 1; }
.sk-line-m-w { height: 14px; background: var(--sh-sk); border-radius: 4px; }
.sk-line-s-w { height: 10px; background: var(--sh-sk-secondary); border-radius: 4px; }
.sk-badge-s { height: 24px; background: var(--sh-sk-secondary); border-radius: 12px; }
</style>
