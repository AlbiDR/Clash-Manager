<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
/**
 * [SHARED] FLOATING DOCK
 * ----------------------------------------------------------------------------
 * Rationale: Orchestrates the global navigation dock and selection FAB.
 * Layer: @shared/ui
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * Acts as a lightweight orchestrator that toggles between `NavigationDock`
 * and `SelectionFab` based on the global UI state. Centralizes viewport-aware
 * styling for the dock container.
 */
import { useUiCoordinator } from "@core";
import { useViewport } from "../composables/useViewport";
import NavigationDock from "./NavigationDock.vue";
import SelectionFab from "./SelectionFab.vue";

const { dockVisible } = useUiCoordinator();
const { isDesktop } = useViewport();
</script>

<template>
  <div
    class="dock-container"
    :class="{
      'fab-mode': !dockVisible,
      'is-desktop': isDesktop
    }"
  >
    <!-- Navigation Dock Mode -->
    <NavigationDock v-if="dockVisible" />

    <!-- Selection FAB Mode -->
    <SelectionFab v-else />
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
  border-radius: var(--sys-shape-corner-full);
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

/* FAB Mode Styling */
.dock-container.fab-mode {
  flex-direction: row;
  align-items: center;
  /* Prevent flex items from wrapping on smaller screens */
  flex-wrap: nowrap;
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
}
</style>
