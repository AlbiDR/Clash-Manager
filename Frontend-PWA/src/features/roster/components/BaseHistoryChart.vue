<script setup lang="ts">
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { computed } from "vue";
import { generateLinearTrend, type Point } from "@core/utils/bezier";

export interface ChartBarItem {
  id: string;
  value: number;
  height: string;
  isProjection: boolean;
  tooltip: string;
}

const props = defineProps<{
  /** Format: array of { value, tooltipLabel } (Oldest to Newest) */
  data: { id: string; value: number; tooltipLabel: string }[];
  /** Optional projected next value */
  projection: { value: number; tooltipLabel: string } | null;
  /** Whether data is loading */
  loading?: boolean;
  /** Theme affects gradient and glow colors */
  theme: 'war' | 'voyage';
  /** Max value for scaling heights */
  maxScale: number;
  /** Optional threshold for coloring 'win' vs 'hit' */
  winThreshold?: number;
}>();

const CHART_MIN_HEIGHT = 15; // Percent

const chartData = computed(() => {
  if (props.loading || props.data.length === 0) {
    return {
      bars: [],
      path: null,
      projPoint: null,
      isPositive: false,
      isEmpty: true,
    };
  }

  const bars: ChartBarItem[] = [];

  // 1. Process Actuals
  props.data.forEach((entry) => {
    bars.push({
      id: entry.id,
      value: entry.value,
      height: `${Math.max(CHART_MIN_HEIGHT, Math.min(100, (entry.value / props.maxScale) * 100))}%`,
      isProjection: false,
      tooltip: entry.tooltipLabel,
    });
  });

  // 2. Process Projection (if any)
  if (props.projection) {
    bars.push({
      id: 'proj-next-value',
      value: props.projection.value,
      height: `${Math.max(CHART_MIN_HEIGHT, Math.min(100, (props.projection.value / props.maxScale) * 100))}%`,
      isProjection: true,
      tooltip: props.projection.tooltipLabel,
    });
  }

  // 3. Geometry
  const totalSlots = bars.length;
  // Map bars to X,Y coordinates (0-100 scale for SVG viewBox)
  const curvePoints: Point[] = bars.map((bar, barIndex) => ({
    x: ((barIndex + 0.5) / totalSlots) * 100,
    y: (1 - Math.min(1, bar.value / props.maxScale)) * 100, // Invert Y for SVG
  }));

  // Generate Linear Trend Line (Best Fit)
  const trend = generateLinearTrend(curvePoints);

  // Identify key points for dots (These stay on the bars, not the line)
  const projPoint = props.projection ? curvePoints[curvePoints.length - 1] : null;

  return {
    bars,
    path: trend.path,
    projPoint,
    isPositive: trend.isPositive,
    isEmpty: false,
  };
});
</script>

<template>
  <div class="chart-container">
    <div
      v-if="chartData.bars.length > 0 && !chartData.isEmpty"
      class="base-chart"
      :class="`theme-${theme}`"
      :style="{ '--bar-count': chartData.bars.length }"
    >
      <!-- SVG Overlay for Trend Line ONLY -->
      <svg
        class="trend-overlay"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
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
        :style="{
          left: `${chartData.projPoint.x}%`,
          top: `${chartData.projPoint.y}%`,
        }"
      ></div>

      <!-- Bars -->
      <div
        v-for="bar in chartData.bars"
        :key="bar.id"
        class="bar hit-target"
        :class="{
          'bar-win':
            !bar.isProjection && props.winThreshold != null && bar.value >= props.winThreshold,
          'bar-hit':
            !bar.isProjection &&
            bar.value > 0 &&
            (props.winThreshold == null || bar.value < props.winThreshold),
          'bar-miss': !bar.isProjection && bar.value === 0,
          'bar-projected': bar.isProjection,
        }"
        :style="{ height: bar.height }"
        v-tooltip="bar.tooltip"
      />
    </div>

    <!-- Skeleton or Empty text -->
    <div
      v-else
      class="chart-empty"
      :class="{ 'skeleton-anim sk-chart-area': loading }"
    >
      <template v-if="loading">
        <div
          v-for="i in 10"
          :key="i"
          class="sk-chart-bar"
          :style="{ height: `${Math.random() * 50 + 30}%` }"
        ></div>
      </template>
      <template v-else> No history </template>
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

.base-chart {
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

/* Theme: WAR - Positive State: Vibrant Green */
.theme-war .trend-path.positive {
  stroke: #4ade80;
  filter: drop-shadow(0 0 4px rgba(74, 222, 128, 0.4));
  stroke-dasharray: 4 2;
  animation: dash-move 2s linear infinite;
}

/* Theme: WAR - Negative State: Coral Red */
.theme-war .trend-path.negative {
  stroke: #f87171;
  filter: drop-shadow(0 0 3px rgba(248, 113, 113, 0.3));
  stroke-dasharray: 4 2;
  animation: dash-move 2s linear infinite;
}

/* Theme: VOYAGE - Positive State: Cyan */
.theme-voyage .trend-path.positive {
  stroke: #22d3ee;
  filter: drop-shadow(0 0 4px rgba(34, 211, 238, 0.4));
  stroke-dasharray: 4 2;
  animation: dash-move 2s linear infinite;
}

/* Theme: VOYAGE - Negative State: Slate */
.theme-voyage .trend-path.negative {
  stroke: #94a3b8;
  filter: drop-shadow(0 0 3px rgba(148, 163, 184, 0.3));
  stroke-dasharray: 4 2;
  animation: dash-move 2s linear infinite;
}


@keyframes dash-move {
  to {
    stroke-dashoffset: -12;
  }
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
  width: 6px;
  height: 6px;
  border: 1px solid var(--sys-color-surface-container);
  transition: background-color 0.3s;
}

/* Theme dots */
.theme-war .chart-dot.projected.positive {
  background: #4ade80;
  box-shadow: 0 0 8px rgba(74, 222, 128, 0.5);
}
.theme-war .chart-dot.projected.negative {
  background: #f87171;
  box-shadow: 0 0 8px rgba(248, 113, 113, 0.5);
}

.theme-voyage .chart-dot.projected.positive {
  background: #22d3ee;
  box-shadow: 0 0 8px rgba(34, 211, 238, 0.5);
}
.theme-voyage .chart-dot.projected.negative {
  background: #94a3b8;
  box-shadow: 0 0 8px rgba(148, 163, 184, 0.5);
}

/* === BARS === */

.bar {
  min-width: 6px;
  width: max(
    6px,
    calc((100% - var(--bar-count, 52) * 2px) / var(--bar-count, 52))
  );
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
  z-index: 30;
}
.hit-target {
  cursor: pointer;
}

/* Theme: War Bar Colors */
.theme-war .bar-hit {
  background: linear-gradient(
    to top,
    var(--sys-color-secondary-container),
    var(--sys-color-secondary)
  );
  opacity: 0.8;
}
.theme-war .bar-win {
  background: linear-gradient(to top, var(--sys-color-primary), #6750a4);
  box-shadow: 0 0 4px rgba(var(--sys-color-primary-rgb), 0.4);
}

/* Theme: Voyage Bar Colors */
.theme-voyage .bar-hit {
  background: linear-gradient(to top, #0891b2, #06b6d4);
  opacity: 0.8;
}
.theme-voyage .bar-win {
  background: linear-gradient(to top, #0284c7, #22d3ee);
  box-shadow: 0 0 4px rgba(34, 211, 238, 0.4);
}

/* Shared Miss */
.bar-miss {
  background: rgba(var(--sys-color-outline-variant-rgb, 100, 100, 100), 0.3);
}

/* Shared Projection Pattern */
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

.chart-empty {
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
