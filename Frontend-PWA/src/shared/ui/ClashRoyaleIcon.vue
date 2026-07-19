<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  size?: number | string;
}>();

const sizePx = computed(() => {
  if (typeof props.size === "number") return `${props.size}px`;
  return props.size || "24px";
});
</script>

<template>
  <svg
    class="clash-royale-icon"
    :width="sizePx"
    :height="sizePx"
    viewBox="11 10 26 29"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M13 15v16l11 6 11-6V15h-6l-5-3-5 3z" fill="#0f4c8a" style="fill:#11569c"/>
    <path d="M13 15v18l12 6 12-6V15h-7l-5-3-5 3zm2 2h5.554L25 14.332 29.446 17H35v14.764l-10 5-10-5zm4 4h1l1 2 2-3h4l1 3 2-2h1v3l-1 2v4H20v-4l-1-2z" opacity=".1"/>
    <path d="M12 14v18l12 6 12-6V14h-7l-5-3-5 3zm2 2h5.554L24 13.332 28.446 16H34v14.764l-10 5-10-5zm4 4h1l1 2h1l1-3h4l1 3h1l1-2h1v3l-1 1v5H19v-5l-1-1z" fill="#e6c419" style="fill:#e8c92b"/>
    <path d="m18 23 1 2h10l1-2zm6 3 1 1-1 1-1-1z" fill="#e6a219"/>
  </svg>
</template>

<style scoped>
.clash-royale-icon {
  display: inline-block;
  vertical-align: middle;
  flex-shrink: 0;
}
</style>
