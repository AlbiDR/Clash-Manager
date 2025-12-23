
<script lang="ts">
export default {
  name: 'FabIsland'
}
</script>

<script setup lang="ts">
import { useUiCoordinator } from '../composables/useUiCoordinator'
import Icon from './Icon.vue'

defineProps<{
  visible: boolean
  label?: string
  dismissLabel?: string
  actionHref?: string
  isProcessing?: boolean
  isBlasting?: boolean
  selectionCount?: number
  blitzEnabled?: boolean
}>()

const { fabOffset } = useUiCoordinator()

const emit = defineEmits<{
  action: [payload: MouseEvent]
  dismiss: []
  blitz: []
}>()
</script>

<template>
  <div 
    class="fab-island" 
    :class="{ 'visible': visible }" 
    :style="{ bottom: `calc(${fabOffset}px + env(safe-area-inset-bottom))` }"
    @touchstart.stop
  >
    <div class="fab-content">
      
      <!-- State: BLASTING (With Controls) -->
      <div v-if="isBlasting" class="blasting-controls">
        <button class="fab-btn danger compact" @click="emit('dismiss')" aria-label="Cancel Blitz">
          <Icon name="close" size="18" />
        </button>

        <div class="blast-status">
          <div class="spinner-small"></div>
          <span class="blast-label">{{ label }}</span>
        </div>

        <a v-if="actionHref" :href="actionHref" class="fab-btn primary compact" @click="(e) => emit('action', e)" aria-label="Open Next Profile">
          <Icon name="chevron_right" size="20" />
        </a>
        <button v-else class="fab-btn primary compact" @click="(e) => emit('action', e)" aria-label="Next">
          <Icon name="chevron_right" size="20" />
        </button>
      </div>

      <!-- State: NORMAL -->
      <template v-else>
        <button class="fab-btn danger" @click="emit('dismiss')" aria-label="Dismiss Selection">
          <Icon name="close" size="18" />
          <span v-if="!selectionCount">{{ dismissLabel || 'Dismiss' }}</span>
        </button>

        <button 
          v-if="blitzEnabled && selectionCount && selectionCount > 1 && !isProcessing"
          class="fab-btn blitz"
          @click="emit('blitz')"
          v-tooltip="'Requires Pop-ups permission'"
          aria-label="Start Blitz Mode"
        >
          <Icon name="lightning" size="18" />
          <span>Blitz</span>
        </button>

        <a v-if="actionHref" :href="actionHref" class="fab-btn primary" @click="(e) => emit('action', e)">
          <Icon name="check" size="18" />
          <span>{{ label || 'Open' }}</span>
        </a>
        
        <button v-else class="fab-btn primary" @click="(e) => emit('action', e)">
          <Icon name="check" size="18" />
          <span>{{ label || 'Open' }}</span>
        </button>
      </template>

    </div>
  </div>
</template>

<style scoped>
.fab-island {
  position: fixed; left: 0; right: 0;
  display: flex; justify-content: center; pointer-events: none; z-index: 300;
  transition: opacity 0.3s ease, transform 0.3s var(--sys-motion-spring), bottom 0.4s var(--sys-motion-spring);
  opacity: 0;
  transform: translateY(20px);
}
.fab-island.visible { 
  opacity: 1; 
  transform: translateY(0);
}

.fab-content {
  pointer-events: auto;
  background: var(--sys-surface-glass);
  backdrop-filter: var(--sys-surface-glass-blur);
  -webkit-backdrop-filter: var(--sys-surface-glass-blur);
  border: 1px solid var(--sys-surface-glass-border);
  padding: 8px; border-radius: var(--shape-corner-full);
  display: flex; gap: 8px;
  box-shadow: var(--sys-elevation-3);
  align-items: center;
}

.fab-btn {
  padding: 14px 20px; border-radius: var(--shape-corner-full);
  font-weight: 800; font-size: 15px; text-decoration: none;
  display: flex; align-items: center; gap: 8px; cursor: pointer; border: none;
  transition: transform 0.2s, background 0.2s;
  color: var(--sys-color-on-surface);
}
.fab-btn:active { transform: scale(0.95); }

.fab-btn.compact {
  padding: 14px;
}

.fab-btn.primary { background: var(--sys-color-primary); color: var(--sys-color-on-primary); }
.fab-btn.danger { background: var(--sys-color-error-container); color: var(--sys-color-on-error-container); }

.fab-btn.blitz {
  background: linear-gradient(135deg, #6b5778, #4a3b55);
  color: #f2daff;
  border: 1px solid rgba(255,255,255,0.1);
  box-shadow: 0 0 12px rgba(107, 87, 120, 0.4);
}

.blasting-controls { display: flex; align-items: center; gap: 12px; }
.blast-status { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; min-width: 80px; }
.blast-label { font-family: var(--sys-font-family-mono); font-size: 12px; font-weight: 700; color: var(--sys-color-on-surface); }

.spinner-small {
  width: 14px; height: 14px;
  border: 2px solid var(--sys-color-primary);
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  opacity: 0.6;
}
@keyframes spin { 100% { transform: rotate(360deg); } }
</style>
