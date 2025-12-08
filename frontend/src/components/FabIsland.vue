<script lang="ts">
export default {
  name: 'FabIsland'
}
</script>

<script setup lang="ts">
import Icon from './Icon.vue'

defineProps<{
  visible: boolean
  label?: string
  dismissLabel?: string
  actionHref?: string
}>()

const emit = defineEmits<{
  action: []
  dismiss: []
}>()
</script>

<template>
  <div class="fab-island" :class="{ 'visible': visible }">
    <div class="fab-content">
      <!-- Dismiss Button (Danger) -->
      <button 
        class="fab-btn danger" 
        @click="emit('dismiss')"
      >
        <Icon name="close" size="18" />
        <span>{{ dismissLabel || 'Dismiss' }}</span>
      </button>

      <!-- Action Button (Primary) -->
      <!-- Render as <a> if href exists to support Deep Links properly -->
      <a 
        v-if="actionHref"
        :href="actionHref"
        class="fab-btn primary" 
        @click="emit('action')"
      >
        <Icon name="check" size="18" />
        <span>{{ label || 'Open' }}</span>
      </a>
      
      <button 
        v-else
        class="fab-btn primary" 
        @click="emit('action')"
      >
        <Icon name="check" size="18" />
        <span>{{ label || 'Open' }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.fab-island {
  position: fixed; bottom: 110px; left: 0; right: 0;
  display: flex; justify-content: center; pointer-events: none; z-index: 300;
  transition: opacity 0.3s ease, transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  opacity: 0;
  transform: translateY(20px);
}
.fab-island.visible { 
  opacity: 1; 
  transform: translateY(0);
}

.fab-content {
  pointer-events: auto;
  background: var(--sys-color-on-surface); color: var(--sys-color-surface);
  padding: 8px; border-radius: var(--shape-corner-full);
  display: flex; gap: 8px;
  box-shadow: var(--sys-elevation-3);
}

.fab-btn {
  padding: 14px 24px; border-radius: var(--shape-corner-full);
  font-weight: 700; font-size: 15px; text-decoration: none;
  display: flex; align-items: center; gap: 8px; cursor: pointer; border: none;
  transition: transform 0.2s; color: inherit;
}
.fab-btn:active { transform: scale(0.95); }

.fab-btn.primary { background: var(--sys-color-primary); color: var(--sys-color-on-primary); }
.fab-btn.danger { background: var(--sys-color-error-container); color: var(--sys-color-on-error-container); }
</style>
