<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import Icon from "./Icon.vue";
import { useHaptics, useUiCoordinator, NAV_ITEMS } from "@core";

const route = useRoute();
const router = useRouter();
const { dockVisible, fabState } = useUiCoordinator();
const haptics = useHaptics();


const isDesktop = ref(window.innerWidth > 1024);
const onResize = () => { isDesktop.value = window.innerWidth > 1024; };
onMounted(() => window.addEventListener("resize", onResize));
onUnmounted(() => window.removeEventListener("resize", onResize));

function goTo(targetPath: string) {
  if (route.path === targetPath) return;
  router.push(targetPath);
}

// Trigger haptic feedback on pointerdown to minimize latency perception.
function onInteractionStart() {
  haptics.tap();
}

function handleFabAction(e: MouseEvent) {
  if (fabState.onAction) fabState.onAction(e);
}

function handleFabBlitz() {
  if (fabState.onBlitz) fabState.onBlitz();
}

function handleFabDismiss() {
  if (fabState.onDismiss) fabState.onDismiss();
}
</script>

<template>
  <div
    class="dock-container"
    :class="{
      'fab-mode': !dockVisible,
      hidden: !dockVisible && !fabState.selectionCount && !fabState.isBlasting,
      'is-desktop': isDesktop
    }"
  >
    <!-- Navigation Dock Mode -->
    <template v-if="dockVisible">
      <button
        v-for="item in NAV_ITEMS"
        :key="item.name"
        class="dock-item"
        :class="{ active: route.path === item.path }"
        @click="goTo(item.path)"
        @pointerdown="onInteractionStart"
        :aria-label="item.label"
        v-bind="{ 'aria-current': route.path === item.path ? 'page' : undefined }"
      >
        <div v-if="route.path === item.path" class="capsule-bg"></div>
        <Icon :name="item.icon" size="22" class="dock-icon" />
        <span v-if="item.label" class="dock-label">
          {{ item.label }}
        </span>
      </button>
    </template>

    <!-- Selection FAB Mode -->
    <template v-else>
      <!-- Dismiss Button (Always Visible) -->
      <button
        class="fab-btn danger"
        :class="{ compact: fabState.isBlasting || (fabState.selectionCount ?? 0) > 0 }"
        @click="handleFabDismiss"
        @pointerdown="onInteractionStart"
        :aria-label="fabState.isBlasting ? 'Cancel Blitz' : 'Dismiss Selection'"
      >
        <Icon name="close" size="18" />
        <span v-if="!fabState.selectionCount && !fabState.isBlasting"
          >Clear</span
        >
      </button>

      <!-- Blasting State: Progress Indicator -->
      <template v-if="fabState.isBlasting">
        <div class="blast-status">
          <div class="spinner-small"></div>
          <span class="blast-label">{{ fabState.label }}</span>
        </div>

        <button
          class="fab-btn primary compact"
          @click="handleFabAction"
          @pointerdown="onInteractionStart"
          aria-label="Open Next Profile"
        >
          <Icon name="chevron_right" size="20" />
        </button>
      </template>

      <!-- Normal Selection State -->
      <template v-else>
        <!-- Blitz Button (Only if enabled and multiple selected) -->
        <button
          v-if="
            fabState.blitzEnabled &&
            fabState.selectionCount &&
            fabState.selectionCount > 1 &&
            !fabState.isProcessing
          "
          class="fab-btn blitz"
          @click="handleFabBlitz"
          @pointerdown="onInteractionStart"
          v-tooltip="'Requires Pop-ups permission'"
          aria-label="Start Blitz Mode"
        >
          <Icon name="lightning" size="18" />
          <span>Blitz</span>
        </button>

        <!-- Action Button (Always Visible) -->
        <button
          class="fab-btn primary"
          @click="handleFabAction"
          @pointerdown="onInteractionStart"
          :aria-label="fabState.label || 'Open'"
        >
          <Icon name="check" size="18" />
          <span :key="fabState.label">{{ fabState.label }}</span>
        </button>
      </template>
    </template>
  </div>
</template>

<style scoped>
.dock-container {
  position: fixed;
  /* Respect safe area insets for notched devices + Showcase Frame */
  bottom: calc(24px + env(safe-area-inset-bottom) + var(--sys-safe-frame-offset, 0px));
  left: 50%;
  transform: translateX(-50%);
  background: var(--sys-surface-glass);

  border: 1px solid var(--sys-surface-glass-border);
  padding: 6px;
  border-radius: var(--shape-corner-full);
  display: flex;
  gap: 6px;
  box-shadow: 
    0 12px 40px rgba(0, 0, 0, 0.3),
    0 0 0 1px rgba(255, 255, 255, 0.05);
  z-index: 500;
  /* Disable double-tap zoom delay */
  touch-action: manipulation;
  /* Optimize transition timing for responsiveness */
  transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.dock-container:hover {
  bottom: calc(28px + env(safe-area-inset-bottom) + var(--sys-safe-frame-offset, 0px));
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
}

.dock-container.hidden:not(.is-desktop) {
  transform: translate(-50%, 150%);
  opacity: 0;
  pointer-events: none;
}

/* On Desktop, we prevent the dock from fully disappearing to maintain layout stability */
.dock-container.hidden.is-desktop {
  opacity: 0.15;
  pointer-events: none;
  transform: translate(-50%, 0) scale(0.95);
}

/* FAB Mode Styling */
.dock-container.fab-mode {
  flex-direction: row;
  align-items: center;
  /* Prevent flex items from wrapping on smaller screens */
  flex-wrap: nowrap;
}

.dock-item {
  position: relative;
  /* Ensure sufficient touch target size */
  height: 56px;
  flex: 1;
  min-width: 64px;
  padding: 0 12px;
  border-radius: var(--shape-corner-full);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  font-size: 15px;
  font-weight: 850;
  color: var(--sys-color-on-surface);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.2, 0, 0, 1);
  -webkit-tap-highlight-color: transparent;
  background: none;
  border: none;
  font-family: inherit;
  /* Prevent text wrapping on narrower viewports */
  white-space: nowrap;
}

/* Active state feedback */
.dock-item:active {
  transform: scale(0.92);
  background: rgba(var(--sys-color-primary-rgb), 0.1);
}

.dock-item.active {
  color: var(--sys-color-on-primary);
  flex: 1.2; /* Slightly more prominence for active item, still balanced by flex */
}

/* Maintain scale stability on active selected item */
.dock-item.active:active {
  transform: scale(0.96);
  background: none;
}

.capsule-bg {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    135deg,
    var(--sys-color-primary),
    var(--sys-color-primary-variant, var(--sys-color-primary))
  );
  border-radius: var(--shape-corner-full);
  z-index: -1;
  animation: pop-in 0.3s cubic-bezier(0.2, 0, 0, 1.2);
  box-shadow: 0 6px 16px rgba(var(--sys-color-primary-rgb), 0.4);
}

@keyframes pop-in {
  from {
    transform: scale(0.6);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

.dock-label {
  transition: opacity 0.3s;
  letter-spacing: -0.01em;
}

/* FAB Buttons */
.fab-btn {
  /* Maintain minimum height for touch targets */
  height: 56px;
  padding: 0 24px;
  min-height: 56px;
  border-radius: var(--shape-corner-full);
  font-weight: 900;
  font-size: 15px;
  text-decoration: none;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  cursor: pointer;
  border: none;
  transition:
    transform 0.15s cubic-bezier(0.2, 0, 0, 1),
    background 0.2s;
  color: var(--sys-color-on-surface);
  /* Prevent text wrapping on constrained mobile viewports */
  white-space: nowrap;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.fab-btn:active {
  transform: scale(0.93);
  opacity: 0.9;
}

.fab-btn.compact {
  padding: 0;
  width: 56px;
  min-width: 56px;
}

.fab-btn.primary {
  background: var(--sys-color-primary);
  color: var(--sys-color-on-primary);
  box-shadow: 0 4px 16px rgba(var(--sys-color-primary-rgb), 0.35);
}
.fab-btn.danger {
  background: var(--sys-color-error-container);
  color: var(--sys-color-on-error-container);
}

.fab-btn.blitz {
  background: linear-gradient(135deg, #6b5778, #4a3b55);
  color: #f2daff;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 0 12px rgba(107, 87, 120, 0.4);
}

.blast-status {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-width: 90px;
}
.blast-label {
  font-family: var(--sys-font-family-mono);
  font-size: 13px;
  font-weight: 800;
  color: var(--sys-color-on-surface);
}

.spinner-small {
  width: 14px;
  height: 14px;
  border: 2px solid var(--sys-color-primary);
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  opacity: 0.6;
}
@keyframes spin {
  100% {
    transform: rotate(360deg);
  }
}

.fade-fast-enter-active,
.fade-fast-leave-active {
  transition: opacity 0.1s ease;
}
.fade-fast-enter-from,
.fade-fast-leave-to {
  opacity: 0;
}

@media (max-width: 600px) {
  .dock-container {
    width: calc(100% - 32px);
    max-width: 460px;
    padding: 4px;
    gap: 4px;
  }
  /* Ensure FAB mode shrink-wraps on mobile to avoid empty space */
  .dock-container.fab-mode {
    width: auto;
    max-width: calc(100% - 32px);
    justify-content: center;
  }
  .dock-item {
    flex: 1;
    min-width: 0; /* Allow shrinking below base */
    padding: 0;
    gap: 4px;
    font-size: 13px;
  }
  .dock-item .dock-label {
    display: none;
  }
  .dock-item.active {
    flex: 2; /* Active item takes more space, but total flex is constant */
  }
  .dock-item.active .dock-label {
    display: block;
    max-width: 80px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* Refine FAB buttons for mobile density */
  .fab-btn:not(.compact) {
    padding: 0 16px;
    gap: 8px;
    font-size: 14px;
  }
}
</style>
