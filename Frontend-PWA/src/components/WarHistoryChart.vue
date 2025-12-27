
<script setup lang="ts">
import { computed } from 'vue'
import { generateLinearTrend, type Point } from '../utils/bezier'
import { calculatePrediction, parseHistoryString, WAR_CONSTANTS } from '../utils/warMath'

const props = defineProps<{
  history?: string
  loading?: boolean // New prop to indicate loading state
}>()

const CHART_MIN_HEIGHT = 15 // Percent

interface BarItem {
  fame: number
  height: string
  isProjection: boolean
  tooltip: string
}

const chartData = computed(() => {
  // If loading, don't process real data, just show placeholder
  if (props.loading) {
    return { bars: [], path: null, projPoint: null, isPositive: false, isEmpty: true }
  }

  // 1. Parse (Newest -> Oldest)
  const allHistory = parseHistoryString(props.history)
  const processedData = allHistory.slice(0, 52) // Limit to last year

  if (processedData.length === 0) {
    return { bars: [], path: null, projPoint: null, isPositive: false, isEmpty: true }
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

  // Generate Linear Trend Line (Best Fit)
  const trend = generateLinearTrend(curvePoints)
  
  // Identify key points for dots (These stay on the bars, not the line)
  const projPoint = curvePoints[curvePoints.length - 1]
  
  return { 
    bars, 
    path: trend.path, 
    projPoint, 
    isPositive: trend.isPositive,
    isEmpty: false
  }
})
</script>

<template>
  <div class="chart-container">
    <div 
      v-if="chartData.bars.length > 0 && !chartData.isEmpty" 
      class="war-chart"
      :style="{ '--bar-count': chartData.bars.length }"
    >
      <!-- SVG Overlay for Trend Line ONLY -->
      <svg class="trend-overlay" viewBox="0 0 100 100" preserveAspectRatio="none">
        <path 
          v-if="chartData.path"
          :d="chartData.path" 
          vector-effect="non-scaling-stroke"
          class="trend-path"
          :class="chartData.isPositive ? 'positive' : 'negative'"
        />
      </svg>

      <!-- HTML Overlays for Dots (Fixes Aspect Ratio Distortion) -->
      <div 
        v-if="chartData.projPoint"
        class="chart-dot projected"
        :class="chartData.isPositive ? 'positive' : 'negative'"
        :style="{ left: `${chartData.projPoint.x}%`, top: `${chartData.projPoint.y}%` }"
      ></div>

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
    
    <!-- Skeleton or "No history" text -->
    <div v-else class="war-chart-empty" :class="{'skeleton-anim sk-chart-area': loading}">
      <template v-if="loading">
        <div v-for="i in 10" :key="i" class="sk-chart-bar" :style="{height: `${Math.random() * 50 + 30}%`}"></div>
      </template>
      <template v-else>
        No history
      </template>
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

/* === TREND LINE === */

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

@keyframes dash-move {
  to { stroke-dashoffset: -12; }
}

/* === DOTS (HTML) === */

.chart-dot {
  position: absolute;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  pointer-events: none;
  z-index: 25; /* Above line (20), Below hovered bar (30) */
}

.chart-dot.projected {
  width: 6px; height: 6px;
  border: 1px solid var(--sys-color-surface-container);
  transition: background-color 0.3s;
}

.chart-dot.projected.positive {
  background: #4ade80;
  box-shadow: 0 0 8px rgba(74, 222, 128, 0.5);
}

.chart-dot.projected.negative {
  background: #f87171;
  box-shadow: 0 0 8px rgba(248, 113, 113, 0.5);
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
  height: 100%; /* Take up full height for skeleton */
  font-size: 10px; 
  color: var(--sys-color-outline); 
  text-align: center; 
  display: flex; /* Flexbox for bars */
  justify-content: center;
  align-items: center; 
  background-color: transparent; /* Reset for skeleton */
  border-radius: 8px;
  gap: 2px; /* Gap between skeleton bars */
  padding: 4px;
  box-sizing: border-box;
}

.sk-chart-area {
  background: var(--sh-sk-secondary); /* Use secondary skeleton color */
  border-radius: 8px;
  padding: 4px; /* Internal padding for bars */
}

.sk-chart-bar {
  width: 8px; /* Fixed width for skeleton bars */
  background: var(--sh-sk); /* Primary skeleton color for bars */
  border-radius: 2px;
  opacity: 0.7;
  height: var(--bar-height); /* Dynamic height set in template */
}
</style>
