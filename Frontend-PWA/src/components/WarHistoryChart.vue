<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  history?: string
}>()

const bars = computed(() => {
  if (!props.history || props.history === '-') return []
  
  // History string comes Descending (Newest -> Oldest)
  const entries = (props.history || '')
    .split('|')
    .map(x => x.trim())
    .filter(Boolean)
  
  // Take latest 52 weeks (approx 1 year), then reverse to show Old -> New (Left -> Right)
  const chronological = entries.slice(0, 52).reverse()
  
  return chronological.map(entry => {
    const parts = entry.split(' ')
    const val = parseInt(parts[0] ?? '0')
    const fame = isNaN(val) ? 0 : val
    const rawWeek = parts[1] || 'Unknown'
    
    // Parse "24W05" -> "Week 5" (Year removed for leanness)
    let readableWeek = rawWeek
    const weekMatch = (rawWeek || '').match(/^(\d{2})W(\d{2})$/)
    if (weekMatch && weekMatch[2]) {
      const weekNum = parseInt(weekMatch[2], 10)
      readableWeek = `Week ${weekNum}`
    }
    
    return {
      fame,
      week: rawWeek,
      tooltip: `<span style="font-size:10px;opacity:0.8;text-transform:uppercase">${readableWeek}</span><br>${fame.toLocaleString()} Fame`
    }
  })
})
</script>

<template>
  <div class="chart-container">
    <div 
      v-if="bars.length > 0" 
      class="war-chart"
      :style="{ '--bar-count': bars.length }"
    >
      <div 
        v-for="(bar, i) in bars" 
        :key="i"
        class="bar hit-target"
        :class="{ 
          'bar-win': bar.fame > 2000, 
          'bar-hit': bar.fame > 0 && bar.fame <= 2000,
          'bar-miss': bar.fame === 0
        }"
        :style="{ 
          height: `${Math.max(15, Math.min(100, (bar.fame / 3200) * 100))}%`
        }"
        v-tooltip="bar.tooltip"
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
  height: 32px;
  overflow-x: auto; /* Enable horizontal scrolling */
  overflow-y: hidden;
  margin: 12px 0;
  display: flex;
  align-items: flex-end;
  scroll-behavior: smooth; /* Smooth scrolling */
  /* Hide scrollbar but keep functionality */
  scrollbar-width: thin;
  scrollbar-color: rgba(var(--sys-color-primary-rgb), 0.3) transparent;
}

/* Webkit scrollbar styling */
.chart-container::-webkit-scrollbar {
  height: 3px;
}

.chart-container::-webkit-scrollbar-track {
  background: transparent;
}

.chart-container::-webkit-scrollbar-thumb {
  background: rgba(var(--sys-color-primary-rgb), 0.3);
  border-radius: 2px;
}

.chart-container::-webkit-scrollbar-thumb:hover {
  background: rgba(var(--sys-color-primary-rgb), 0.5);
}

.war-chart {
  display: flex;
  align-items: flex-end;
  height: 100%;
  min-width: 100%; /* Allow expansion beyond container width */
  gap: 2px;
}

.bar {
  min-width: 6px; /* Minimum width to keep bars readable */
  width: max(6px, calc((100% - var(--bar-count, 52) * 2px) / var(--bar-count, 52))); /* Responsive width */
  min-height: 4px;
  border-radius: 2px;
  opacity: 0.9;
  transition: all 0.2s ease;
  background-color: var(--sys-color-surface-container-highest);
  position: relative;
}

.bar:hover {
  transform: scaleY(1.1);
  opacity: 1;
  z-index: 10;
}

.hit-target {
  /* Increase touch area for tooltips */
  cursor: pointer;
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
  background: rgba(var(--sys-color-outline-variant-rgb, 100, 100, 100), 0.3);
}

.war-chart-empty {
  width: 100%;
  font-size: 10px;
  color: var(--sys-color-outline);
  text-align: center;
  align-self: center;
}
</style>
