<script setup lang="ts">
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { computed } from "vue";
import { generateLinearTrend, type Point } from "@core/utils/bezier";

const props = defineProps<{
  history?: string;
  loading?: boolean;
}>();

const CHART_MIN_HEIGHT = 15; // Percent
// Assuming 250 is a good baseline for a very strong voyage performance.
const MAX_CROWNS_SCALE = 250; 
const WIN_THRESHOLD = 100; // Crowns to be considered "good"

interface BarItem {
  crowns: number;
  height: string;
  tooltip: string;
  id: string;
}

const chartData = computed(() => {
  if (props.loading) {
    return { bars: [], path: null, isPositive: false, isEmpty: true };
  }

  // 1. Parse (Newest -> Oldest)
  const allHistory = (props.history || '')
    .split('|')
    .map(s => s.trim())
    .filter(Boolean)
    .map(entry => {
      const [valStr, dateStr] = entry.split(' ');
      const crowns = parseInt(valStr || "0", 10) || 0;
      return { crowns, date: dateStr || "?" };
    });

  const processedData = allHistory.slice(0, 15); // Limit to last 15 voyages

  if (processedData.length === 0) {
    return { bars: [], path: null, isPositive: false, isEmpty: true };
  }

  // 2. Arrange for Display (Oldest -> Newest)
  const chronologicalData = [...processedData].reverse();
  const bars: BarItem[] = [];

  chronologicalData.forEach((historyPoint, entryIndex) => {
    // Format date nicely if possible (e.g., YYYY-MM-DD to MM/DD)
    let displayDate = historyPoint.date;
    if (displayDate.length >= 10) {
      displayDate = displayDate.substring(5).replace('-', '/');
    }

    bars.push({
      id: `vh-${historyPoint.date}-${entryIndex}`,
      crowns: historyPoint.crowns,
      height: `${Math.max(CHART_MIN_HEIGHT, Math.min(100, (historyPoint.crowns / MAX_CROWNS_SCALE) * 100))}%`,
      tooltip: `<span style="font-size:10px;opacity:0.8;text-transform:uppercase">${displayDate}</span><br>${historyPoint.crowns.toLocaleString()} Crowns`,
    });
  });

  // 3. Geometry (Trend line)
  const totalSlots = bars.length;
  const curvePoints: Point[] = bars.map((bar, barIndex) => ({
    x: ((barIndex + 0.5) / totalSlots) * 100,
    y: (1 - Math.min(1, bar.crowns / MAX_CROWNS_SCALE)) * 100, // Invert Y for SVG
  }));

  const trend = generateLinearTrend(curvePoints);

  return {
    bars,
    path: trend.path,
    isPositive: trend.isPositive,
    isEmpty: false,
  };
});
</script>

<template>
  <div class="chart-container">
    <div
      v-if="chartData.bars.length > 0 && !chartData.isEmpty"
      class="war-chart"
      :style="{ '--bar-count': chartData.bars.length }"
    >
      <!-- SVG Overlay for Trend Line -->
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

      <!-- Bars -->
      <div
        v-for="bar in chartData.bars"
        :key="bar.id"
        class="bar hit-target"
        :class="{
          'bar-win': bar.crowns >= WIN_THRESHOLD,
          'bar-hit': bar.crowns > 0 && bar.crowns < WIN_THRESHOLD,
          'bar-miss': bar.crowns === 0,
        }"
        :style="{ height: bar.height }"
        v-tooltip="bar.tooltip"
      />
    </div>

    <!-- Skeleton or "No history" text -->
    <div
      v-else
      class="war-chart-empty"
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
      <template v-else> No voyage history </template>
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

/* Voyage uses a cyan/blue theme to differentiate from War */
.trend-path.positive {
  stroke: #22d3ee;
  filter: drop-shadow(0 0 4px rgba(34, 211, 238, 0.4));
  stroke-dasharray: 4 2;
  animation: dash-move 2s linear infinite;
}

.trend-path.negative {
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

/* === BARS === */
.bar {
  min-width: 6px;
  width: max(
    6px,
    calc((100% - var(--bar-count, 15) * 2px) / var(--bar-count, 15))
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

/* Voyage Colors: Cyan/Teal */
.bar-hit {
  background: linear-gradient(to top, #0891b2, #06b6d4);
  opacity: 0.8;
}
.bar-win {
  background: linear-gradient(to top, #0284c7, #22d3ee);
  box-shadow: 0 0 4px rgba(34, 211, 238, 0.4);
}
.bar-miss {
  background: rgba(var(--sys-color-outline-variant-rgb, 100, 100, 100), 0.3);
}

.war-chart-empty {
  width: 100%;
  height: 100%;
  font-size: 10px;
  color: var(--sys-color-outline);
  text-align: center;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: transparent;
  border-radius: 8px;
  gap: 2px;
  padding: 4px;
  box-sizing: border-box;
}

.sk-chart-area {
  background: var(--sh-sk-secondary);
  border-radius: 8px;
  padding: 4px;
}

.sk-chart-bar {
  width: 8px;
  background: var(--sh-sk);
  border-radius: 2px;
  opacity: 0.7;
}
</style>
