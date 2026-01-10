<script setup lang="ts">
import { useRoute, useRouter } from "vue-router";
import { useUiCoordinator } from "../composables/useUiCoordinator";
import { useHaptics } from "../composables/useHaptics";
import Icon from "./Icon.vue";

const route = useRoute();
const router = useRouter();
const { dockVisible, fabState } = useUiCoordinator();
const haptics = useHaptics();

interface NavItem {
  path: string;
  name: string;
  label: string;
  icon: string;
}

const navItems: NavItem[] = [
  {
    path: "/leaderboard",
    name: "leaderboard",
    label: "Leaderboard",
    icon: "leaderboard",
  },
  {
    path: "/recruiter",
    name: "recruiter",
    label: "Headhunter",
    icon: "recruiter",
  },
  {
    path: "/settings",
    name: "settings",
    label: "Settings",
    icon: "settings",
  },
];

function goTo(targetPath: string) {
  if (route.path === targetPath) return;
  router.push(targetPath);
}

// ⚡ RESPONSIVENESS: Move haptics to pointerdown for immediate "hardwired" feel
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
  <!-- Navigation Dock Mode -->
  <div v-if="dockVisible" class="dock-container">
    <button
      v-for="item in navItems"
      :key="item.name"
      class="dock-item"
      :class="{ active: route.path === item.path }"
      @click="goTo(item.path)"
      @pointerdown="onInteractionStart"
      :aria-label="item.label"
    >
      <div v-if="route.path === item.path" class="capsule-bg"></div>
      <Icon :name="item.icon" size="22" class="dock-icon" />
      <span v-if="item.label" class="dock-label">
        {{ item.label }}
      </span>
    </button>
  </div>

  <!-- Selection FAB Mode -->
  <div v-else class="dock-container fab-mode">
    <!-- State: BLASTING (With Controls) -->
    <template v-if="fabState.isBlasting">
      <button
        class="fab-btn danger compact"
        @click="handleFabDismiss"
        @pointerdown="onInteractionStart"
        aria-label="Cancel Blitz"
      >
        <Icon name="close" size="18" />
      </button>

      <div class="blast-status">
        <div class="spinner-small"></div>
        <span class="blast-label">{{ fabState.label }}</span>
      </div>

      <a
        v-if="fabState.actionHref"
        :href="fabState.actionHref"
        class="fab-btn primary compact"
        @click="handleFabAction"
        @pointerdown="onInteractionStart"
        aria-label="Open Next Profile"
      >
        <Icon name="chevron_right" size="20" />
      </a>
      <button
        v-else
        class="fab-btn primary compact"
        @click="handleFabAction"
        @pointerdown="onInteractionStart"
        aria-label="Next"
      >
        <Icon name="chevron_right" size="20" />
      </button>
    </template>

    <!-- State: NORMAL Selection -->
    <template v-else>
      <button
        class="fab-btn danger"
        @click="handleFabDismiss"
        @pointerdown="onInteractionStart"
        aria-label="Dismiss Selection"
      >
        <Icon name="close" size="18" />
        <span v-if="!fabState.selectionCount">Clear</span>
      </button>

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

      <a
        v-if="fabState.actionHref"
        :href="fabState.actionHref"
        class="fab-btn primary"
        @click="handleFabAction"
        @pointerdown="onInteractionStart"
      >
        <Icon name="check" size="18" />
        <span>{{ fabState.label || "Open" }}</span>
      </a>

      <button
        v-else
        class="fab-btn primary"
        @click="handleFabAction"
        @pointerdown="onInteractionStart"
      >
        <Icon name="check" size="18" />
        <span>{{ fabState.label || "Open" }}</span>
      </button>
    </template>
  </div>
</template>

<style scoped>
.dock-container {
  position: fixed;
  /* 🏗️ FIXED: Corrected env variable to safe-area-inset-bottom for accurate mobile layout */
  bottom: calc(24px + env(safe-area-inset-bottom));
  left: 50%;
  transform: translateX(-50%);
  background: var(--sys-surface-glass);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--sys-surface-glass-border);
  padding: 6px;
  border-radius: var(--shape-corner-full);
  display: flex;
  gap: 4px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
  z-index: 500;
  /* ⚡ INTERACTION: manipulation prevents double-tap zoom delay */
  touch-action: manipulation;
  /* ⚡ SNAPPY: Reduced duration (0.5s -> 0.3s) for much more responsive feel */
  transition:
    transform 0.3s cubic-bezier(0.2, 0, 0, 1),
    opacity 0.2s ease;
}

.dock-container.hidden {
  transform: translate(-50%, 150%);
  opacity: 0;
  pointer-events: none;
}

/* FAB Mode Styling */
.dock-container.fab-mode {
  padding: 8px;
  gap: 8px;
}

.dock-item {
  position: relative;
  /* 🎯 HIT TARGET: Increased vertical padding for better mobile reliability */
  padding: 12px 24px;
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
  min-width: 64px;
}

/* ⚡ TACTILE: Immediate visual feedback on press */
.dock-item:active {
  transform: scale(0.92);
  background: rgba(var(--sys-color-primary-rgb), 0.1);
}

.dock-item.active {
  color: var(--sys-color-on-primary);
}

/* Ensure active state doesn't jitter on the selected item */
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
  /* 🏷️ LEGIBILITY: More weighted text for mobile glanceability */
  letter-spacing: -0.01em;
}

/* FAB Buttons */
.fab-btn {
  /* 🏗️ PROPORTIONS: Balanced padding for better mobile feel */
  padding: 14px 24px;
  min-height: 52px;
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
}
.fab-btn:active {
  transform: scale(0.93);
  opacity: 0.9;
}

.fab-btn.compact {
  padding: 14px;
  min-width: 52px;
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

@media (max-width: 480px) {
  .dock-item:not(.active) .dock-label {
    display: none;
  }
  /* 🏗️ MOBILE FIX: Narrower padding to prevent overflow on small devices */
  .dock-item {
    padding: 14px 16px;
    min-width: 56px;
  }
  .dock-item.active {
    padding: 14px 24px;
    min-width: 100px;
  }
  /* 🏷️ SETTINGS FIX: Ensure settings icon hit target is large even without label */
  .dock-item[aria-label="Settings"] {
    padding: 14px 22px;
  }
}
</style>
