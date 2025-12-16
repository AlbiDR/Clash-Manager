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
  
  return entries.slice(-104)
})

const chartStyle = computed(() => {
  const len = bars.value.length
  if (len > 50) return { gap: '1px', radius: '1px' }
  if (len > 30) return { gap: '1px', radius: '2px' }
  if (len > 20) return { gap: '2px', radius: '3px' }
  return { gap: '4px', radius: '4px' }
})
</script>

<template>
  <div class="chart-container">
    <div 
      v-if="bars.length > 0" 
      class="war-chart"
      :style="{ gap: chartStyle.gap }"
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
          height: `${Math.max(15, Math.min(100, (fame / 3200) * 100))}%`,
          borderRadius: chartStyle.radius
        }"
      />
    </div>
    <div v-else class="war-chart-empty">
      No war history
    </div>
  </div>
</template>

<style scoped>
.chart-container {
  width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none; 
}
.chart-container::-webkit-scrollbar { display: none; }

.war-chart {
  display: flex;
  align-items: flex-end;
  height: 48px;
  padding: 4px 0;
  min-width: 100%;
  width: fit-content;
}

.bar {
  flex: 1;
  min-height: 4px;
  background: var(--sys-color-surface-container-highest);
  transition: all 0.2s ease;
  position: relative;
}

.bar-hit {
  background: linear-gradient(to top, var(--sys-color-secondary-container), var(--sys-color-secondary));
  opacity: 0.8;
}

.bar-win {
  background: linear-gradient(to top, var(--sys-color-primary), #6750a4);
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.bar-miss {
  background: var(--sys-color-surface-container-highest);
  opacity: 0.5;
}

.war-chart-empty {
  font-size: 0.75rem;
  color: var(--sys-color-outline);
  text-align: center;
  padding: 1rem 0;
}
</style>
