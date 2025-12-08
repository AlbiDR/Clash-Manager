<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  history?: string
}>()

// Parse war history string (Format: "Score WeekID | Score WeekID...")
// Returns array of fame values, oldest to newest (left to right)
const bars = computed(() => {
  if (!props.history || props.history === '-') return []
  
  const entries = props.history
    .split('|')
    .map(x => parseInt((x.trim().split(' ')[0]) ?? '0') || 0)
    .reverse() // Oldest → Newest (left to right)
  
  // Cap at 52 weeks (1 year)
  return entries.slice(-52)
})

// Dynamic styling based on density
const chartStyle = computed(() => {
  const len = bars.value.length
  if (len > 40) return { gap: '1px', radius: '1px' }
  if (len > 20) return { gap: '2px', radius: '2px' }
  return { gap: '4px', radius: '4px' }
})
</script>

<template>
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
</template>

<style scoped>
.war-chart {
  display: flex;
  align-items: flex-end;
  height: 48px;
  padding: 4px 0;
}

.bar {
  flex: 1;
  min-height: 4px;
  background: var(--md-sys-color-surface-variant, #e0e0e0);
  transition: all 0.2s ease;
}

.bar-hit {
  background: var(--md-sys-color-secondary, #625b71);
}

.bar-win {
  background: var(--md-sys-color-primary, #6750a4);
}

.bar-miss {
  opacity: 0.3;
}

.war-chart-empty {
  font-size: 0.75rem;
  color: var(--md-sys-color-outline, #79747e);
  text-align: center;
  padding: 1rem 0;
}
</style>
