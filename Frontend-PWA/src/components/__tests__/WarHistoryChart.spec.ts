
<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  history?: string
}>()

// --- SMOOTHING MATH HELPERS ---
const line = (pointA: {x:number, y:number}, pointB: {x:number, y:number}) => {
  const lengthX = pointB.x - pointA.x
  const lengthY = pointB.y - pointA.y
  return {
    length: Math.sqrt(Math.pow(lengthX, 2) + Math.pow(lengthY, 2)),
    angle: Math.atan2(lengthY, lengthX)
  }
}

const controlPoint = (current: {x:number, y:number}, previous: {x:number, y:number}, next: {x:number, y:number}, reverse?: boolean) => {
  const p = previous || current
  const n = next || current
  const smoothing = 0.15 // Tension
  const o = line(p, n)
  const angle = o.angle + (reverse ? Math.PI : 0)
  const length = o.length * smoothing
  const x = current.x + Math.cos(angle) * length
  const y = current.y + Math.sin(angle) * length
  return { x, y }
}

const generateSmoothPath = (points: {x: number, y: number}[]) => {
  if (points.length < 2) return ''
  
  let d = `M ${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`
  
  for (let i = 0; i < points.length - 1; i++) {
    const pCurrent = points[i]
    const pNext = points[i + 1]
    const pPrev = points[i - 1] || pCurrent
    const pNextNext = points[i + 2] || pNext
    
    const cp1 = controlPoint(pCurrent, pPrev, pNext, false)
    const cp2 = controlPoint(pNext, pCurrent, pNextNext, true)
    
    d += ` C ${cp1.x.toFixed(2)},${cp1.y.toFixed(2)} ${cp2.x.toFixed(2)},${cp2.y.toFixed(2)} ${pNext.x.toFixed(2)},${pNext.y.toFixed(2)}`
  }
  return d
}

const chartData = computed(() => {
  if (!props.history || props.history === '-') return { bars: [], path: null, lastPoint: null, projPoint: null, isPositive: false }
  
  // 1. Parse History
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
      readableWeek = `Week ${parseInt(weekMatch[2], 10)}`
    }
    
    return { fame, week: rawWeek, readableWeek }
  })

  // 2. Prediction Logic (Clamped Weighted Average: 70/20/10)
  let nextFame = 0
  const n = rawPoints.length
  const maxScale = 3200 
  
  if (n >= 1) {
    if (n >= 3) {
      const p1 = rawPoints[n - 1].fame // Most Recent
      const p2 = rawPoints[n - 2].fame // Previous
      const p3 = rawPoints[n - 3].fame // 3rd Last
      
      // Weighting
      let projection = (p1 * 0.70) + (p2 * 0.20) + (p3 * 0.10)
      
      // Form Modifier (Streak Bonus)
      // If last 3 wars were > 2000 (Win), add +160 fame (~5%)
      if (p1 > 2000 && p2 > 2000 && p3 > 2000) {
        projection += 160
      }
      
      nextFame = projection
    } else if (n === 2) {
      // Fallback for limited history: 70/30
      const p1 = rawPoints[n - 1].fame
      const p2 = rawPoints[n - 2].fame
      nextFame = (p1 * 0.70) + (p2 * 0.30)
    } else {
      nextFame = rawPoints[n - 1].fame
    }
    
    // Clamp Rule: 0 to Max Scale
    nextFame = Math.max(0, Math.min(maxScale, nextFame))
  }

  // 3. Build Bars
  const bars = rawPoints.map(p => ({
    fame: p.fame,
    isProjection: false,
    tooltip: `<span style="font-size:10px;opacity:0.8;text-transform:uppercase">${p.readableWeek}</span><br>${p.fame.toLocaleString()} Fame`
  }))

  if (n > 0) {
    bars.push({
      fame: nextFame,
      isProjection: true,
      tooltip: `<span style="font-size:10px;opacity:0.8;text-transform:uppercase;color:#fbbf24">Projected (70/20/10)</span><br>${Math.round(nextFame).toLocaleString()} Fame`
    })
  }

  // 4. Build Curve Points
  const totalSlots = bars.length
  const points = bars.map((bar, i) => ({
    x: ((i + 0.5) / totalSlots) * 100,
    y: (1 - Math.min(1, bar.fame / maxScale)) * 100
  }))

  const path = generateSmoothPath(points)
  
  // Coordinates for the trend dot (Last point)
  const projPoint = points.length > 0 ? points[points.length - 1] : null
  // Coordinates for the anchor dot (Second to last point)
  const lastPoint = points.length > 1 ? points[points.length - 2] : null
  
  const isPositive = n > 0 && nextFame >= rawPoints[n - 1].fame

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
      <svg class="trend-overlay" viewBox="0 0 100 100" preserveAspectRatio="none">
        <!-- The Smooth Curve -->
        <path 
          v-if="chartData.path"
          :d="chartData.path" 
          vector-effect="non-scaling-stroke"
          class="trend-path"
          :class="{ 'positive': chartData.isPositive }"
        />
        
        <!-- Anchor Dot (Last Actual) -->
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
          :class="{ 'positive': chartData.isPositive }"
          vector-effect="non-scaling-stroke"
        />
      </svg>

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
  position: relative;
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

.trend-path {
  fill: none;
  stroke: #fbbf24;
  stroke-width: 1.5px;
  opacity: 0.8;
  filter: drop-shadow(0 1px 1px rgba(0,0,0,0.3));
  transition: all 0.3s ease;
}

.trend-path.positive { stroke: #fbbf24; }

.trend-dot {
  fill: #fbbf24;
  stroke: var(--sys-color-surface-container);
  stroke-width: 1px;
}

.trend-dot-anchor {
  fill: var(--sys-color-outline);
  opacity: 0.5;
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
  border: 1px dashed rgba(251, 191, 36, 0.5);
  opacity: 0.8;
}

.war-chart-empty { width: 100%; font-size: 10px; color: var(--sys-color-outline); text-align: center; align-self: center; }
</style>
