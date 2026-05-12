<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { useHaptics } from "@core";

/**
 * STATUS PILL / CONNECTIVITY HUB (Layer 2 - Shared UI)
 * ----------------------------------------------------------------------------
 * Rationale: Provides a "Command Center" view of application connectivity.
 * Features: Actionable Expansion, Metadata HUD, Success Breath-Pulse.
 * ----------------------------------------------------------------------------
 */

const props = withDefaults(defineProps<{
  type: "success" | "warning" | "error" | "loading";
  text: string;
  nominal?: boolean;
  direction?: "left" | "right";
  remoteInfo?: {
    source: string;
    dataAge: string | null;
    diagnosis?: string | null;
    lastCompiled?: string | null;
  };
}>(), {
  direction: "right"
});

const emit = defineEmits<{
  refresh: [];
}>();

const haptics = useHaptics();
const isExpanded = ref(false);
const isRefreshingLocally = ref(false);

// Auto-expand on errors or loading to catch user attention
watch(() => props.type, (newType) => {
  if (newType === "loading") {
    isExpanded.value = true;
    isRefreshingLocally.value = true;
  } else {
    isRefreshingLocally.value = false;
    if (newType === "error") isExpanded.value = true;
  }
});

const handleToggle = (e: Event) => {
  // Prevent toggle if clicking the internal sync button
  if ((e.target as HTMLElement).closest('.sync-action')) return;
  
  if (props.type === "loading") return;
  haptics.tap();
  isExpanded.value = !isExpanded.value;
};

const handleRefresh = () => {
  if (props.type === 'loading') return;
  haptics.impact('light');
  emit('refresh');
};

const isDB = computed(() => props.text === 'DB');
const displaySource = computed(() => {
  if (!props.remoteInfo?.source) return null;
  // If the status is 'DB', showing 'SUPABASE' is redundant
  if (isDB.value && props.remoteInfo.source === 'SUPABASE') return null;
  return props.remoteInfo.source;
});
</script>

<template>
  <div
    class="status-pill"
    :class="[
      props.type, 
      `expand-${props.direction}`,
      { 'is-expanded': isExpanded, 'is-nominal': props.nominal }
    ]"
    @click="handleToggle"
  >
    <div class="status-dot">
      <div 
        class="dot-nucleus" 
        :class="{ 
          'breath': props.type === 'success' && !isExpanded, 
          'pulse': props.type !== 'success',
          'is-syncing': props.type === 'loading' 
        }"
      >
        <template v-if="props.type === 'loading'">
          <svg class="spinner" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="3" />
          </svg>
        </template>
      </div>
      <div v-if="props.type !== 'loading'" class="dot-halo"></div>
    </div>

    <Transition :name="props.direction === 'left' ? 'slide-fade-left' : 'slide-fade'">
      <div v-if="isExpanded || props.type === 'loading'" class="label-wrapper">
        <!-- LOADING STATE -->
        <template v-if="props.type === 'loading'">
          <span class="status-label technical">Syncing...</span>
        </template>

        <!-- EXPANDED HUB -->
        <template v-else-if="isExpanded">
          <div class="hub-dashboard">
            <div class="hub-main-info">
              <span class="status-label technical" :class="{ 'is-db': isDB }">
                <template v-if="isDB">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                  </svg>
                </template>
                {{ props.text }}
              </span>
              
                <div v-if="displaySource || props.remoteInfo?.dataAge || props.remoteInfo?.diagnosis" class="hub-details">
                <span v-if="displaySource" class="source-tag technical" :class="displaySource.toLowerCase()">
                  {{ displaySource }}
                </span>
                <span v-if="props.remoteInfo?.diagnosis" class="diagnosis-info technical">
                  {{ props.remoteInfo.diagnosis }}
                </span>
                <span v-else-if="props.remoteInfo?.dataAge" class="age-info technical">
                  {{ props.remoteInfo.dataAge }}
                </span>
              </div>
            </div>

            <button 
              class="sync-action" 
              :disabled="props.type === 'loading'"
              title="Force Sync"
              @click="handleRefresh"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
              </svg>
            </button>
          </div>
        </template>

        <!-- COMPACT STATE -->
        <template v-else>
          <span class="status-label technical" :class="{ 'is-db': isDB }">
            <template v-if="isDB">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
              </svg>
            </template>
            {{ props.text }}
          </span>
        </template>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.status-pill {
  display: inline-flex;
  align-items: center;
  height: 32px;
  padding: 0 4px;
  border-radius: 16px;
  background: var(--sys-surface-container);
  border: 1px solid var(--sys-outline);
  overflow: hidden;
  cursor: pointer;
  transition: all 0.5s var(--sys-motion-spring);
  user-select: none;
  position: relative;
  z-index: 50;
}

.status-pill.is-nominal {
  border-color: transparent;
  background: transparent;
}

.status-pill.is-expanded {
  padding: 0 6px 0 4px;
  background: var(--sys-surface-glass);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-color: var(--sys-outline-variant);
  box-shadow: var(--sys-elevation-level2);
}

.status-pill.expand-left.is-expanded {
  flex-direction: row-reverse;
  padding: 0 4px 0 6px;
}

/* Color Tones */
.status-pill.success { color: var(--sys-success); }
.status-pill.warning { color: var(--sys-warning); border-color: var(--sys-warning); }
.status-pill.error   { color: var(--sys-error); border-color: var(--sys-error); }
.status-pill.loading { border-color: var(--sys-primary); color: var(--sys-primary); }

.status-dot {
  position: relative;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.dot-nucleus {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
  z-index: 2;
  transition: all 0.3s var(--sys-motion-standard);
}

.status-pill.loading .dot-nucleus {
  background: transparent;
}

.dot-nucleus.breath {
  animation: breath 4s ease-in-out infinite;
}

.dot-nucleus.pulse {
  animation: pulse 2s infinite;
}

.dot-halo {
  position: absolute;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.12;
  animation: halo-pulse 2.5s infinite;
}

.label-wrapper {
  display: flex;
  align-items: center;
  white-space: nowrap;
  margin-left: 4px;
  overflow: hidden;
}

.status-pill.expand-left .label-wrapper {
  margin-left: 0;
  margin-right: 4px;
}

.technical {
  font-family: var(--sys-font-mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.status-label.is-db {
  display: flex;
  align-items: center;
  gap: 3px;
  color: var(--sys-primary);
}

/* HUB DASHBOARD STYLES */
.hub-dashboard {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 4px 8px;
}

.hub-main-info {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 80px;
}

.hub-details {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
  opacity: 0.8;
}

.status-label {
  line-height: 1.2;
}

.source-tag {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 1px 4px;
  border-radius: 4px;
  background: var(--sys-surface-container-highest);
  color: var(--sys-text-secondary);
  font-size: 8px;
  font-weight: 800;
}

.source-tag.supabase {
  color: var(--sys-primary);
  background: var(--sys-primary-container);
}

.age-info,
.diagnosis-info {
  color: var(--sys-text-tertiary);
  font-size: 9px;
}

.diagnosis-info {
  color: var(--sys-warning);
}

.status-pill.error .diagnosis-info {
  color: var(--sys-error);
}

.sync-action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  border: none;
  background: var(--sys-surface-container-high);
  color: var(--sys-primary);
  cursor: pointer;
  transition: all 0.2s var(--sys-motion-standard);
}

.sync-action:hover {
  background: var(--sys-primary);
  color: var(--sys-on-primary);
  transform: scale(1.1);
}

.sync-action:active {
  transform: scale(0.9);
}

.sync-action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.spinner {
  width: 14px;
  height: 14px;
  animation: rotate 1.5s linear infinite;
}

@keyframes rotate {
  100% { transform: rotate(360deg); }
}

@keyframes breath {
  0%, 100% { transform: scale(1); opacity: 0.8; }
  50% { transform: scale(1.15); opacity: 1; }
}

@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.3); }
}

@keyframes halo-pulse {
  0% { transform: scale(0.8); opacity: 0.25; }
  100% { transform: scale(2.4); opacity: 0; }
}

/* Transitions */
.slide-fade-enter-active, .slide-fade-leave-active {
  transition: all 0.4s var(--sys-motion-spring);
}
.slide-fade-enter-from, .slide-fade-leave-to {
  transform: translateX(-12px);
  opacity: 0;
}

.slide-fade-left-enter-active, .slide-fade-left-leave-active {
  transition: all 0.4s var(--sys-motion-spring);
}
.slide-fade-left-enter-from, .slide-fade-left-leave-to {
  transform: translateX(12px);
  opacity: 0;
}
</style>
