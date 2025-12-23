
<script setup lang="ts">
import { computed } from 'vue'
import { generateSmoothPath, type Point } from '../utils/bezier'
import { calculatePrediction, parseHistoryString, WAR_CONSTANTS } from '../utils/warMath'

const props = defineProps<{
  history?: string
}>()

const CHART_MIN_HEIGHT = 15 // Percent

interface BarItem {
  fame: number
  height: string
  isProjection: boolean
  tooltip: string
}

const chartData = computed(() => {
  // 1. Parse (Newest -> Oldest)
  const allHistory = parseHistoryString(props.history)
  const processedData = allHistory.slice(0, 52) // Limit to last year

  if (processedData.length === 0) {
    return { bars: [], path: null, projPoint: null, lastPoint: null, isPositive: false }
  }

  // 2. Predict (using Newest->Oldest data)
  const fameValues = processedData.map(d => d.fame)
  const nextFame = calculatePrediction(fameValues)

  // 3. Arrange for Display (Oldest -> Newest)
  const chronologicalData = [...processedData].reverse()
  const bars: BarItem[] = []
  
  // Actuals
  chronologicalData.forEach(p => {
    bars.push({
      fame: p.fame,
      height: `${Math.max(CHART_MIN_HEIGHT, Math.min(100, (p.fame / WAR_CONSTANTS.MAX_FAME) * 100))}%`,
      isProjection: false,
      tooltip: `<span style="font-size:10px;opacity:0.8;text-transform:uppercase">${p.readableWeek}</span><br>${p.fame.toLocaleString()} Fame`
    })
  })

  // Projection
  bars.push({
    fame: nextFame,
    height: `${Math.max(CHART_MIN_HEIGHT, Math.min(100, (nextFame / WAR_CONSTANTS.MAX_FAME) * 100))}%`,
    isProjection: true,
    tooltip: `<span style="font-size:10px;opacity:0.8;text-transform:uppercase;color:#fbbf24">Projected</span><br>${Math.round(nextFame).toLocaleString()} Fame`
  })

  // 4. Geometry
  const totalSlots = bars.length
  // Map bars to X,Y coordinates (0-100 scale for SVG viewBox)
  const curvePoints: Point[] = bars.map((bar, i) => ({
    x: ((i + 0.5) / totalSlots) * 100,
    y: (1 - Math.min(1, bar.fame / WAR_CONSTANTS.MAX_FAME)) * 100 // Invert Y for SVG
  }))

  const path = generateSmoothPath(curvePoints)
  
  // Identify key points for dots
  const projPoint = curvePoints[curvePoints.length - 1]
  const lastPoint = curvePoints.length > 1 ? curvePoints[curvePoints.length - 2] : null
  
  // Trend Logic: Is projection >= last actual?
  const lastActualFame = processedData[0].fame
  const isPositive = nextFame >= lastActualFame

  return { bars, path, projPoint, lastPoint, isPositive }
})
</script>

<template>
  <div class="chart-container">
    <div 
      v-if="chartData.bars.length > 0" 
      class="war-chart"
      :style="{ '--bar-count': chartData.bars.length }"
    >
      <!-- SVG Overlay for Trend Line -->
      <svg class="trend-overlay" viewBox="0 0 100 100" preserveAspectRatio="none">
        <path 
          v-if="chartData.path"
          :d="chartData.path" 
          vector-effect="non-scaling-stroke"
          class="trend-path"
          :class="chartData.isPositive ? 'positive' : 'negative'"
        />
        
        <!-- Last Actual Anchor Dot -->
        <circle 
          v-if="chartData.lastPoint"
          :cx="chartData.lastPoint.x" :cy="chartData.lastPoint.y" 
          r="1.5" 
          class="trend-dot-anchor"
          vector-effect="non-scaling-stroke"
        />
        
        <!-- Projection Dot -->
        <circle 
          v-if="chartData.projPoint"
          :cx="chartData.projPoint.x" :cy="chartData.projPoint.y" 
          r="2.5" 
          class="trend-dot"
          :class="chartData.isPositive ? 'positive' : 'negative'"
          vector-effect="non-scaling-stroke"
        />
      </svg>

      <!-- Bars -->
      <div 
        v-for="(bar, i) in chartData.bars" 
        :key="i"
        class="bar hit-target"
        :class="{ 
          'bar-win': !bar.isProjection && bar.fame > WAR_CONSTANTS.WIN_THRESHOLD, 
          'bar-hit': !bar.isProjection && bar.fame > 0 && bar.fame <= WAR_CONSTANTS.WIN_THRESHOLD,
          'bar-miss': !bar.isProjection && bar.fame === 0,
          'bar-projected': bar.isProjection
        }"
        :style="{ height: bar.height }"
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
  height: 48px;
  overflow-x: auto;
  overflow-y: hidden;
  margin: 12px 0;
  display: flex;
  align-items: flex-end;
  scroll-behavior: smooth;
  scrollbar-width: thin;
  scrollbar-color: rgba(var(--sys-color-primary-rgb), 0.3) transparent;
  padding-top: 10px;
  position: relative; /* Ensure stacking context */
}

/* Custom Scrollbar for Desktop */
.chart-container::-webkit-scrollbar { height: 3px; }
.chart-container::-webkit-scrollbar-track { background: transparent; }
.chart-container::-webkit-scrollbar-thumb { background: rgba(var(--sys-color-primary-rgb), 0.3); border-radius: 2px; }

.war-chart {
  display: flex;
  align-items: flex-end;
  height: 100%;
  min-width: 100%;
  gap: 2px;
  position: relative;
  z-index: 1;
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

/* === TREND LINE & DOTS === */

.trend-path {
  fill: none;
  stroke-width: 1.5px;
  opacity: 0.9;
  transition: all 0.3s ease;
}

/* Positive State: Vibrant Green + Glow + Animation */
.trend-path.positive {
  stroke: #4ade80;
  filter: drop-shadow(0 0 4px rgba(74, 222, 128, 0.4));
  stroke-dasharray: 4 2;
  animation: dash-move 2s linear infinite;
}

/* Negative State: Coral Red + Dotted + Animation */
.trend-path.negative {
  stroke: #f87171;
  filter: drop-shadow(0 0 3px rgba(248, 113, 113, 0.3));
  stroke-dasharray: 4 2;
  animation: dash-move 2s linear infinite;
}

.trend-dot {
  stroke: var(--sys-color-surface-container);
  stroke-width: 1px;
}

.trend-dot.positive {
  fill: #4ade80;
  box-shadow: 0 0 8px rgba(74, 222, 128, 0.5);
}

.trend-dot.negative {
  fill: #f87171;
  box-shadow: 0 0 8px rgba(248, 113, 113, 0.5);
}

.trend-dot-anchor {
  fill: var(--sys-color-outline);
  opacity: 0.5;
}

@keyframes dash-move {
  to { stroke-dashoffset: -12; }
}

/* === BARS === */

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

/* Status Colors */
.bar-hit { background: linear-gradient(to top, var(--sys-color-secondary-container), var(--sys-color-secondary)); opacity: 0.8; }
.bar-win { background: linear-gradient(to top, var(--sys-color-primary), #6750a4); box-shadow: 0 0 4px rgba(var(--sys-color-primary-rgb), 0.4); }
.bar-miss { background: rgba(var(--sys-color-outline-variant-rgb, 100, 100, 100), 0.3); }

/* Projection Pattern */
.bar-projected {
  background: repeating-linear-gradient(
    45deg,
    var(--sys-color-surface-container-highest),
    var(--sys-color-surface-container-highest) 4px,
    rgba(251, 191, 36, 0.15) 4px,
    rgba(251, 191, 36, 0.15) 8px
  );
  border: 1px dashed rgba(251, 191, 36, 0.5);
  opacity: 0.8;
}

.war-chart-empty { 
  width: 100%; 
  font-size: 10px; 
  color: var(--sys-color-outline); 
  text-align: center; 
  align-self: center; 
}
</style>
