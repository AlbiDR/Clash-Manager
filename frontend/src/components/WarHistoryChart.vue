<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  history?: string
}>()

const bars = computed(() => {
  if (!props.history || props.history === '-') return []
  
  const entries = (props.history || '')
    .split('|')
    .map(x => {
        const parts = (x || '').trim().split(' ')
        const val = parseInt(parts[0] ?? '0')
        return isNaN(val) ? 0 : val
    })
    .reverse()
  
  return entries.slice(-52) // Show last 52 weeks max
})
</script>

<template>
  <div class="chart-container">
    <div 
      v-if="bars.length > 0" 
      class="war-chart"
    >
      <div 
        v-for="(fame, i) in bars" 
        :key="i"
        class="bar"
        :class="{ 
          'bar-win': fame > 2000, 
          'bar-hit': fame > 0 && fame <= 2000,
          'bar-miss': fame === 0
        }"
        :style="{ 
          height: `${Math.max(15, Math.min(100, (fame / 3200) * 100))}%`
        }"
      />
    </div>
    <div v-else class="war-chart-empty">
      No history
    </div>
  </div>
</template>

<style scoped>
.chart-container {
  width: 100%;
  height: 28px; /* Slightly taller for elegance */
  overflow: hidden;
  margin: 12px 0; /* More breathing room */
  display: flex; align-items: flex-end;
}

.war-chart {
  display: flex;
  align-items: flex-end;
  height: 100%;
  width: 100%;
  gap: 4px; /* Increased gap for clarity */
}

.bar {
  flex: 1;
  min-height: 4px;
  border-radius: 99px; /* Fully rounded pill shape */
  opacity: 0.9;
  transition: all 0.2s ease;
  background-color: var(--sys-color-surface-container-highest);
}

.bar-hit {
  background: linear-gradient(to top, var(--sys-color-secondary-container), var(--sys-color-secondary));
  opacity: 0.8;
}

.bar-win {
  background: linear-gradient(to top, var(--sys-color-primary), #6750a4);
  box-shadow: 0 0 4px rgba(var(--sys-color-primary-rgb), 0.4);
}

.bar-miss {
  background: rgba(255, 255, 255, 0.05);
}

.war-chart-empty {
  width: 100%;
  font-size: 10px;
  color: var(--sys-color-outline);
  text-align: center;
  align-self: center;
}
</style>
