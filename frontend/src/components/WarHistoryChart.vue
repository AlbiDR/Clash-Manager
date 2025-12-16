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
          height: `${Math.max(10, Math.min(100, (fame / 3200) * 100))}%`
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
  height: 24px; /* Fixed small height */
  overflow: hidden;
  margin: 8px 0;
  display: flex; align-items: flex-end;
}

.war-chart {
  display: flex;
  align-items: flex-end;
  height: 100%;
  width: 100%;
  gap: 2px;
}

.bar {
  flex: 1;
  min-height: 2px;
  border-radius: 1px;
  opacity: 0.5;
  transition: all 0.2s ease;
}

.bar-hit {
  background-color: var(--sys-color-secondary);
}

.bar-win {
  background-color: var(--sys-color-primary);
  opacity: 1;
}

.bar-miss {
  background-color: var(--sys-color-surface-container-highest);
  opacity: 0.3;
}

.war-chart-empty {
  width: 100%;
  font-size: 10px;
  color: var(--sys-color-outline);
  text-align: center;
  align-self: center;
}
</style>
