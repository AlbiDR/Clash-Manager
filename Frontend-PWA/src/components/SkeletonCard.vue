
<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  index?: number
}>()

// Deterministic variation based on index to mimic real data diversity
const nameWidth = computed(() => {
  if (props.index === undefined) return '120px'
  const widths = ['120px', '140px', '90px', '130px', '100px', '150px']
  return widths[props.index % widths.length]
})

const metaWidth = computed(() => {
  if (props.index === undefined) return '80px'
  const widths = ['80px', '90px', '60px', '85px', '70px', '75%']
  return widths[props.index % widths.length]
})
</script>

<template>
  <div class="sk-card skeleton-anim">
    <div class="sk-header-group">
      <div class="sk-meta-stack">
        <div class="sk-badge-s"></div>
        <div class="sk-badge-s"></div>
      </div>
      
      <div class="sk-info">
        <div class="sk-player-name" :style="{ width: nameWidth }"></div>
        <div class="sk-line-s" :style="{ width: metaWidth }"></div>
      </div>
    </div>
    <div class="sk-box"></div>
  </div>
</template>

<style scoped>
/* All styles are now in style.css to share with index.html */
/* We only keep vue-specific overrides if absolutely necessary, but here we want exact parity */
</style>
