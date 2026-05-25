<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import { computed } from "vue";
import { ICONS } from "../../core/theme/icons";

const props = defineProps<{
  name: string;
  size?: number | string;
  filled?: boolean;
}>();

const sizePx = computed(() => {
  if (typeof props.size === "number") return `${props.size}px`;
  return props.size || "24px";
});
</script>

<template>
  <svg
    class="icon"
    :width="sizePx"
    :height="sizePx"
    viewBox="0 0 24 24"
    role="img"
    v-bind="{ 'aria-hidden': 'true' }"
    :style="{ width: sizePx, height: sizePx }"
  >
    <title>{{ name }} icon</title>
    <path
      class="icon-path"
      :d="ICONS[name] || ''"
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
