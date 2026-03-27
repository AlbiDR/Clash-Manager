<script setup lang="ts">
import { useHaptics } from "../../core/services/useHaptics";
import { ref, computed, watch, onUnmounted } from "vue";

const props = defineProps<{
  type: "success" | "warning" | "error" | "loading";
  text: string;
  nominal?: boolean;
  hubInfo?: {
    source: "WORKER" | "GAS";
    hubAge: string | null;
  };
  lastSuccess?: string;
  schemaVersion?: string;
}>();

const emit = defineEmits<{
  refresh: [];
}>();

const haptics = useHaptics();
const isExpanded = ref(false);
let collapeTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * TOGGLE DETAIL VIEW
 * Rationale: Exception-based UI keeps the hub 'silent' (dot only)
 * until the user requests technical depth or a state shift occurs.
 */
function handleToggle() {
  isExpanded.value = !isExpanded.value;
  haptics.tap();

  if (isExpanded.value) {
    startCollapseTimer();
  }
}

function startCollapseTimer() {
  if (collapeTimer) clearTimeout(collapeTimer);
  collapeTimer = setTimeout(() => {
    isExpanded.value = false;
  }, 5000); // 5s Auto-collapse
}

// Watch for state transitions to trigger haptics and expansion
watch(() => props.type, (newType, oldType) => {
  if (newType === oldType) return;
  
  if (newType === 'warning') {
    haptics.warning();
    isExpanded.value = true; // Auto-expand on warning
    startCollapseTimer();
  } else if (newType === 'error') {
    haptics.error();
    isExpanded.value = true; // Auto-expand on error
  }
});

onUnmounted(() => {
  if (collapeTimer) clearTimeout(collapeTimer);
});

const indicatorColor = computed(() => {
  if (props.type === "error") return "var(--sys-color-error)";
  if (props.type === "warning") return "var(--sys-color-warning, #ed9121)";
  if (props.type === "loading") return "var(--sys-color-primary)";
  return "var(--sys-color-success)";
});

const showLabel = computed(() => !props.nominal || isExpanded.value || props.type === 'loading');
</script>

<template>
  <div 
    class="status-container"
    :class="[props.type, { 'is-expanded': isExpanded, 'is-nominal': props.nominal }]"
    @click="handleToggle"
  >
    <div class="status-pill">
      <!-- Pulsing Nucleus -->
      <div 
        class="status-dot" 
        :style="{ backgroundColor: indicatorColor }"
      >
        <div class="dot-nucleus" :class="{ 'pulse': props.type !== 'success' }"></div>
      </div>

      <!-- Content Expansion -->
      <Transition name="expand">
        <div v-if="showLabel" class="label-wrapper">
          <span class="status-text">{{ props.type === 'loading' ? 'Syncing...' : props.text }}</span>
        </div>
      </Transition>
    </div>

    <!-- Technical Backdrop (Metadata) -->
    <Transition name="fade">
      <div v-if="isExpanded" class="tech-metadata">
        <div class="meta-row">
          <span class="meta-label">Transport:</span>
          <span class="meta-value">{{ props.hubInfo?.source || 'Hub' }}</span>
        </div>
        <div v-if="props.lastSuccess" class="meta-row">
          <span class="meta-label">Last Sync:</span>
          <span class="meta-value">{{ props.lastSuccess }} ago</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Schema:</span>
          <span class="meta-value">{{ props.schemaVersion || 'v13.3.1' }}</span>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.status-container {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
  z-index: 100;
}

.status-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px;
  background: var(--sys-surface-glass, rgba(255, 255, 255, 0.05));
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-radius: 99px;
  border: 1px solid var(--sys-surface-glass-border, rgba(255, 255, 255, 0.1));
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transition: all 0.4s cubic-bezier(0.19, 1, 0.22, 1);
  overflow: hidden;
  max-width: 24px; /* Default Dot Width */
}

.is-expanded .status-pill,
.status-container:not(.is-nominal) .status-pill,
.loading .status-pill {
  max-width: 200px;
  padding: 6px 12px 6px 8px;
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  position: relative;
  flex-shrink: 0;
  transition: background-color 0.3s;
}

.dot-nucleus {
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  background: inherit;
  opacity: 0.3;
}

.dot-nucleus.pulse {
  animation: pulse 2s infinite cubic-bezier(0.4, 0, 0.6, 1);
}

.label-wrapper {
  overflow: hidden;
  white-space: nowrap;
}

.status-text {
  font-size: 12px;
  font-weight: 800;
  color: var(--sys-color-on-surface);
  letter-spacing: -0.02em;
}

/* Metadata Panel */
.tech-metadata {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  background: var(--sys-surface-glass, rgba(30, 30, 35, 0.8));
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 140px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  pointer-events: none;
}

.meta-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  font-size: 11px;
}

.meta-label {
  color: var(--sys-color-outline, rgba(255, 255, 255, 0.5));
  font-weight: 600;
}

.meta-value {
  color: var(--sys-color-on-surface, #fff);
  font-weight: 700;
  font-family: var(--sys-font-mono, monospace);
}

/* Transitions */
.expand-enter-active, .expand-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.expand-enter-from, .expand-leave-to {
  opacity: 0;
  transform: translateX(10px);
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
  transform: translateY(-5px);
}

@keyframes pulse {
  0% { transform: scale(1); opacity: 0.4; }
  50% { transform: scale(2.5); opacity: 0; }
  100% { transform: scale(1); opacity: 0.4; }
}

/* Loading Spinner (Fallback for nucleus if preferred) */
.loading .status-dot {
  animation: spin 1s linear infinite;
  border: 2px solid transparent;
  border-top-color: currentColor;
  background: transparent !important;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
