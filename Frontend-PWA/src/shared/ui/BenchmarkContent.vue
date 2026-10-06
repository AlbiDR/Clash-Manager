<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import { computed, watch } from "vue";
import ScoreCompositionPanel from "./ScoreCompositionPanel.vue";
import BenchmarkPanel from "./BenchmarkPanel.vue";
import type { BenchmarkContentData } from "../../core";

const props = defineProps<{ data: BenchmarkContentData }>();
const emit = defineEmits<{ expanded: [expanded: boolean] }>();
const score = computed(() => typeof props.data !== "string" && "kind" in props.data ? props.data : null);
const benchmark = computed(() => typeof props.data === "string" ? null :
  "kind" in props.data ? props.data.rawComparison ?? null : props.data);
const simpleLines = computed(() => typeof props.data === "string" ? props.data.split("\n") : []);

// Missing comparison data still permits the existing score explanation.
watch(() => !!score.value && !benchmark.value, expanded => emit("expanded", expanded), { immediate: true });
function onBreakdownToggle(event: Event) {
  emit("expanded", (event.currentTarget as HTMLDetailsElement).open);
}
</script>

<template>
  <div
    v-if="score"
    class="bc-score-content"
  >
    <BenchmarkPanel
      v-if="benchmark"
      :data="benchmark"
    />
    <details
      v-if="benchmark"
      class="bc-score-breakdown"
      @toggle="onBreakdownToggle"
    >
      <summary>Score breakdown</summary>
      <ScoreCompositionPanel :data="score" />
    </details>
    <ScoreCompositionPanel
      v-else
      :data="score"
    />
  </div>
  <div
    v-else-if="!benchmark && simpleLines.length > 1"
    class="bc-simple-rich"
  >
    <span class="bc-simple-label label-section">{{ simpleLines[0] }}</span>
    <span class="bc-simple-value">{{ simpleLines[1] }}</span>
  </div>
  <div
    v-else-if="!benchmark"
    class="bc-simple"
  >
    {{ data }}
  </div>
  <BenchmarkPanel
    v-else
    :data="benchmark"
  />
</template>

<style scoped>
.bc-simple {
  font-size: var(--sys-typescale-body-sm);
  font-weight: 700;
  color: var(--sys-color-on-surface);
  line-height: var(--sys-leading-tight);
}

.bc-simple-rich {
  display: flex;
  flex-direction: column;
  gap: var(--sys-space-4);
}

.bc-simple-label {
  color: var(--sys-color-on-surface-variant);
}

.bc-simple-value {
  font-size: var(--sys-typescale-body-md);
  font-weight: 700;
  font-family: var(--sys-font-family-mono);
  color: var(--sys-color-on-surface);
}

.bc-score-content {
  max-height: var(--score-content-max-height, none);
  overflow-y: auto;
  overscroll-behavior: contain;
}
.bc-score-content :deep(.score-composition) {
  max-height: none;
  overflow: visible;
}
.bc-score-breakdown { margin-top: var(--sys-space-12); }
.bc-score-breakdown summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: var(--sys-space-48);
  border-top: var(--sys-space-1) solid var(--sys-surface-glass-border);
  color: var(--sys-color-on-surface-variant);
  font-size: var(--sys-typescale-body-sm);
  cursor: pointer;
  list-style: none;
}
.bc-score-breakdown summary::-webkit-details-marker { display: none; }
.bc-score-breakdown summary::after { content: '+'; font-family: var(--sys-font-family-mono); }
.bc-score-breakdown[open] > summary::after { content: '−'; }
.bc-score-breakdown summary:focus-visible {
  outline: var(--sys-space-2) solid var(--sys-color-primary);
  outline-offset: calc(-1 * var(--sys-space-2));
  border-radius: var(--sys-shape-corner-small);
}
</style>
