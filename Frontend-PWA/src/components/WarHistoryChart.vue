<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  history?: string
}>()

const chartData = computed(() => {
  if (!props.history || props.history === '-') return { bars: [], trend: null }
  
  // 1. Parse History (Chronological)
  const entries = (props.history || '')
    .split('|')
    .map(x => x.trim())
    .filter(Boolean)
  
  const chronological = entries.slice(0, 52).reverse()
  
  const rawPoints = chronological.map(entry => {
    const parts = entry.split(' ')
    const val = parseInt(parts[0] ?? '0')
    const fame = isNaN(val) ? 0 : val
    const rawWeek = parts[1] || 'Unknown'
    
    let readableWeek = rawWeek
    const weekMatch = (rawWeek || '').match(/^(\d{2})W(\d{2})$/)
    if (weekMatch && weekMatch[2]) {
      const weekNum = parseInt(weekMatch[2], 10)
      readableWeek = `Week ${weekNum}`
    }
    
    return { fame, week: rawWeek, readableWeek }
  })

  // 2. Trend & Projection (Linear Regression)
  let trendLine = null
  let nextFame = 0
  
  if (rawPoints.length >= 2) {
    const n = rawPoints.length
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0
    
    // x = index, y = fame
    rawPoints.forEach((p, i) => {
      sumX += i
      sumY += p.fame
      sumXY += i * p.fame
      sumXX += i * i
    })
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
    const intercept = (sumY - slope * sumX) / n
    
    // Predict next value (at index n)
    nextFame = Math.max(0, slope * n + intercept)
    
    // Calculate SVG Coordinates (Percentages)
    // We have n points currently + 1 projection = n + 1 total slots
    const totalSlots = n + 1
    const maxScale = 3200 // Consistent with bar height calc
    
    // Start of line (x=0)
    const startY = Math.max(0, intercept)
    
    trendLine = {
      x1: `${(0 + 0.5) / totalSlots * 100}%`,
      y1: `${(1 - Math.min(1, startY / maxScale)) * 100}%`,
      x2: `${(n + 0.5) / totalSlots * 100}%`, // Center of projection slot
      y2: `${(1 - Math.min(1, nextFame / maxScale)) * 100}%`,
      isPositive: slope >= 0
    }
  } else if (rawPoints.length === 1) {
    nextFame = rawPoints[0].fame
  }

  // 3. Build Final Bars
  const bars = rawPoints.map(p => ({
    fame: p.fame,
    isProjection: false,
    tooltip: `<span style="font-size:10px;opacity:0.8;text-transform:uppercase">${p.readableWeek}</span><br>${p.fame.toLocaleString()} Fame`
  }))

  // Add Projection Bar
  if (rawPoints.length > 0) {
    bars.push({
      fame: nextFame,
      isProjection: true,
      tooltip: `<span style="font-size:10px;opacity:0.8;text-transform:uppercase;color:#fbbf24">Projected</span><br>${Math.round(nextFame).toLocaleString()} Fame`
    })
  }

  return { bars, trend: trendLine }
})
</script>

<template>
  <div class="chart-container">
    <div 
      v-if="chartData.bars.length > 0" 
      class="war-chart"
      :style="{ '--bar-count': chartData.bars.length }"
    >
      <!-- Trend Overlay -->
      <svg v-if="chartData.trend" class="trend-overlay" preserveAspectRatio="none">
        <line 
          :x1="chartData.trend.x1" :y1="chartData.trend.y1" 
          :x2="chartData.trend.x2" :y2="chartData.trend.y2" 
          vector-effect="non-scaling-stroke"
          class="trend-line"
          :class="{ 'positive': chartData.trend.isPositive }"
        />
        <circle 
          :cx="chartData.trend.x2" :cy="chartData.trend.y2" 
          r="2.5" 
          class="trend-dot"
          :class="{ 'positive': chartData.trend.isPositive }"
        />
      </svg>

      <!-- Bars -->
      <div 
        v-for="(bar, i) in chartData.bars" 
        :key="i"
        class="bar hit-target"
        :class="{ 
          'bar-win': !bar.isProjection && bar.fame > 2000, 
          'bar-hit': !bar.isProjection && bar.fame > 0 && bar.fame <= 2000,
          'bar-miss': !bar.isProjection && bar.fame === 0,
          'bar-projected': bar.isProjection
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
  height: 48px; /* Increased slightly for overlays */
  overflow-x: auto;
  overflow-y: hidden;
  margin: 12px 0;
  display: flex;
  align-items: flex-end;
  scroll-behavior: smooth;
  scrollbar-width: thin;
  scrollbar-color: rgba(var(--sys-color-primary-rgb), 0.3) transparent;
  padding-top: 10px; /* Space for trend line going high */
}

.chart-container::-webkit-scrollbar { height: 3px; }
.chart-container::-webkit-scrollbar-track { background: transparent; }
.chart-container::-webkit-scrollbar-thumb { background: rgba(var(--sys-color-primary-rgb), 0.3); border-radius: 2px; }

.war-chart {
  display: flex;
  align-items: flex-end;
  height: 100%;
  min-width: 100%;
  gap: 2px;
  position: relative; /* Context for SVG */
}

.trend-overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 20;
  overflow: visible;
}

.trend-line {
  stroke: #fbbf24; /* Amber for projection/insight */
  stroke-width: 2px;
  stroke-dasharray: 4 2;
  opacity: 0.8;
  filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3));
}

.trend-dot {
  fill: #fbbf24;
  stroke: var(--sys-color-surface-container);
  stroke-width: 1px;
}

.bar {
  min-width: 6px;
  width: max(6px, calc((100% - var(--bar-count, 52) * 2px) / var(--bar-count, 52)));
  min-height: 4px;
  border-radius: 2px;
  opacity: 0.9;
  transition: all 0.2s ease;
  background-color: var(--sys-color-surface-container-highest);
  position: relative;
}

.bar:hover { transform: scaleY(1.1); opacity: 1; z-index: 30; }
.hit-target { cursor: pointer; }

.bar-hit { background: linear-gradient(to top, var(--sys-color-secondary-container), var(--sys-color-secondary)); opacity: 0.8; }
.bar-win { background: linear-gradient(to top, var(--sys-color-primary), #6750a4); box-shadow: 0 0 4px rgba(var(--sys-color-primary-rgb), 0.4); }
.bar-miss { background: rgba(var(--sys-color-outline-variant-rgb, 100, 100, 100), 0.3); }

.bar-projected {
  background: repeating-linear-gradient(
    45deg,
    var(--sys-color-surface-container-highest),
    var(--sys-color-surface-container-highest) 4px,
    rgba(251, 191, 36, 0.15) 4px,
    rgba(251, 191, 36, 0.15) 8px
  );
  border: 1px dashed rgba(251, 191, 36, 0.5); /* Amber border */
  opacity: 0.8;
}

.war-chart-empty { width: 100%; font-size: 10px; color: var(--sys-color-outline); text-align: center; align-self: center; }
</style>
