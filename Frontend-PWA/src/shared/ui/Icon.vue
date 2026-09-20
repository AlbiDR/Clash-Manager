<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import { computed } from "vue";
import { ICONS, ICON_VIEW_BOXES, type IconPath } from "../../core/theme/icons";

const props = defineProps<{
  name: string;
  size?: number | string;
  filled?: boolean;
  viewBox?: string;
}>();

const sizePx = computed(() => {
  if (typeof props.size === "number") return `${props.size}px`;
  return props.size || "24px";
});

const iconPaths = computed<readonly IconPath[]>(() => {
  const definition = ICONS[props.name];
  if (!definition) return [];
  return typeof definition === "string" ? [{ d: definition }] : definition;
});

const resolvedViewBox = computed(() => props.viewBox || ICON_VIEW_BOXES[props.name] || "0 0 24 24");
</script>

<template>
  <svg
    class="icon"
    :width="sizePx"
    :height="sizePx"
    :viewBox="resolvedViewBox"
    role="img"
    v-bind="{ 'aria-hidden': 'true' }"
    :style="{ width: sizePx, height: sizePx }"
  >
    <title>{{ name }} icon</title>
    <path
      v-for="path in iconPaths"
      :key="path.d"
      class="icon-path"
      :d="path.d"
      :fill="path.fill"
      :opacity="path.opacity"
      v-bind="{ 'vector-effect': 'non-scaling-stroke' }"
    />
  </svg>
</template>

<style scoped>
.icon {
  display: inline-block;
  vertical-align: middle;
  flex-shrink: 0;
  transition: all var(--md-sys-motion-duration-short4)
    var(--md-sys-motion-easing-standard);
}

.icon-path {
  fill: currentColor;
}
</style>
