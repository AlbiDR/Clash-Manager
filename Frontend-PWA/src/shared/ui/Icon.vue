<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import { computed } from "vue";
import {
  getIconPaths,
  getIconViewBox,
  type IconPath,
} from "../../core/theme/icons";

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

// SVG length attributes reject CSS functions such as var() even though the
// equivalent CSS width and height declarations are valid. Omit the attributes
// for token-driven sizes and let the inline style remain the single authority.
const sizeAttribute = computed(() => sizePx.value.includes("(") ? undefined : sizePx.value);

const iconPaths = computed<readonly IconPath[]>(() => getIconPaths(props.name));

const resolvedViewBox = computed(() => props.viewBox || getIconViewBox(props.name));
</script>

<template>
  <svg
    class="icon"
    :width="sizeAttribute"
    :height="sizeAttribute"
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
      :style="path.fill ? { fill: path.fill } : undefined"
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
