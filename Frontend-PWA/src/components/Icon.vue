
<script setup lang="ts">
import { computed } from 'vue'
import { ICONS } from '../icons'

const props = defineProps<{
  name: string
  size?: number | string
  filled?: boolean
}>()

const sizePx = computed(() => {
  if (typeof props.size === 'number') return `${props.size}px`
  return props.size || '24px'
})
</script>

<template>
  <svg 
    class="icon" 
    :width="sizePx" 
    :height="sizePx" 
    viewBox="0 0 24 24" 
    :style="{ width: sizePx, height: sizePx }"
  >
    <path 
      :d="ICONS[name] || ''" 
      fill="currentColor"
    />
  </svg>
</template>

<style scoped>
.icon {
  display: inline-block;
  vertical-align: middle;
  flex-shrink: 0;
  transition: all var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard);
}
</style>

