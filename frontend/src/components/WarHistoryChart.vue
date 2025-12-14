<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  history?: string
}>()

// Parse war history string (Format: "Score WeekID | Score WeekID...")
// Returns array of fame values, oldest to newest (left to right)
const bars = computed(() => {
  if (!props.history || props.history === '-') return []
  
  // Format: "1600 24W10 | 0 24W09"
  const entries = (props.history || '')
    .split('|')
    .map(x => {
        const parts = (x || '').trim().split(' ') // Safe trim
        const val = parseInt(parts[0] ?? '0')
        return isNaN(val) ? 0 : val
    })
    .reverse() // Oldest → Newest (left to right)
  
  // Cap at 104 weeks (2 years) just in case, but rely on CSS for width
  return entries.slice(-104)
})

// Dynamic styling based on density
const chartStyle = computed(() => {
  const len = bars.value.length
  if (len > 50) return { gap: '1px', radius: '1px' }
  if (len > 30) return { gap: '1px', radius: '2px' }
  if (len > 20) return { gap: '2px', radius: '3px' }
  return { gap: '4px', radius: '4px' } // Default rounded
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
  -webkit-overflow-scrolling: touch; /* Smooth scroll on iOS */
  /* Hide scrollbar */
  scrollbar-width: none; 
}
.chart-container::-webkit-scrollbar { display: none; }

.war-chart {
  display: flex;
  align-items: flex-end;
  height: 48px;
  padding: 4px 0;
  min-width: 100%; /* Ensure it fills at least the container */
  width: fit-content; /* Allow it to grow horizontally if dense */
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
