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
    viewBox="140 100 920 980"
    xmlns="http://www.w3.org/2000/svg"
    xml:space="preserve"
    fill-rule="evenodd"
    stroke-linejoin="round"
    stroke-miterlimit="2"
    clip-rule="evenodd"
  >
    <!-- Outer Shield Border -->
    <path fill="currentColor" d="m192 254 1-5c3-9 10-9 12-9h235c2 0 2 0 8-5l93-74 26-22c3-1 23-18 27-21 3-2 10-11 21-3l7 7c19 15 61 49 64 50l20 17 16 12 41 34c6 4 6 5 8 5h237c1 0 10 0 12 9l-3 90-8 191-8 224-5 110c0 15 1 18-8 23l-184 94-185 95c-11 5-12 5-22 0l-80-40-38-20-247-125c-12-6-16-6-16-18l-7-172-10-274-5-125zm796 10h5q1-1 2 3l-5 131-2 60-2 66-6 152-7 181c-1 10-1 11-3 12l-23 13-22 11-67 34-34 17-27 14-184 94q-6 4-10 0L323 911l-40-21-33-16c-9-5-10-5-10-8l-1-21-5-133-12-297-5-148q-2-2 3-3h227c6 0 9-5 20-14l64-51 69-55q5-6 9-2l91 73 30 24 18 15c10 7 12 9 16 10z"/>
    <!-- Inner Swords / Shield Details -->
    <path fill="currentColor" d="M455 792h-39c-10-3-9-15-9-16l-23-321c0-2 0-12 11-13l52-1c1 0 12-1 16 8l11 46h3l12-3c3-2 3-3 7-14l22-65c4-8 11-7 20-7h144c12 0 13 7 17 21l21 61c1 3 1 3 12 6q5 3 6-1c1-2 10-41 12-44 3-9 12-8 17-8l52 1q8 1 9 13l-24 326q0 10-11 11zm179-204c7 0 46 1 81 6 6 1 49 7 73 19q6 2 4 9l-4 59-6 82q-1 4-5 1c-36-19-120-29-199-25-10 0-92 3-140 24l-6 3-2-1-2-28-8-119c0-2 1-3 12-8 21-8 26-5 27-12 1-2 0-8-8-6l-31 10q-1 1-1-2l-6-72-3-43v-8q-2-10 0-12h28q5 0 5 5l12 47c6 10 16 6 22 4l28-10c7-3 7-6 12-20l20-59c1-2 1-2 18-2h119c2 1 2 3 6 14 20 60 20 61 22 63 3 4 5 4 20 9l21 7q10 3 15-8l12-48c1-2 1-2 16-2l17 1-3 37-6 96-1 2c-2 1-2 0-8-2a507 507 0 0 0-199-22c-5 2-5 11 3 11zm122 179v1H460l1-2h4c12-3 24-7 60-12 46-5 96-4 104-4 68 1 106 11 115 13z"/>
    <!-- Crown main shapes -->
    <path fill="currentColor" fill-opacity=".9" d="m615 615 43 43c6 6 2 9-4 15l-44 43c-5 5-9 0-13-3l-45-46c-4-5 1-10 4-13l45-44c6-5 10 0 13 3zm25 42q8 6 6 7l-9 9-30 29q-1 3-9-5l-31-31-1-3c-1-1 0-1 8-10l30-29q3-2 8 4z"/>
    <!-- Crown accents -->
    <path fill="currentColor" fill-opacity=".9" d="m533 591-37 4q-5 2-7-3s-4-7 5-9c11-1 52-6 55-5 7 1 8 11-1 12z"/>
    <path fill="currentColor" d="M600 851v-36c1-6 12-8 12 4v38c0 8-7 7-8 6q-6-3-4-12"/>
    <!-- Vertical dividers (top and bottom) -->
    <path fill="currentColor" d="M599 120h2v80h-2zM599 691h2v24h-2z"/>
  </svg>
</template>

<style scoped>
.clash-royale-icon {
  display: inline-block;
  vertical-align: middle;
  flex-shrink: 0;
}
</style>
