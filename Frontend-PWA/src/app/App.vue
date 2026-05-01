<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import {
  ErrorBoundary,
  ToastContainer,
  FloatingDock,
} from "@shared";
import {
  useClashDataStore,
  useShowcaseMode,
  useConnectionStatus,
  useHaptics,
  useUiCoordinator,
  useSystemInfo,
} from "@core";
import { onMounted, computed, watch } from "vue";
import { RouterView, useRoute } from "vue-router";
import { useHeadhunter } from "@features/headhunter";
import { useRegisterSW } from "virtual:pwa-register/vue";

const clashDataStore = useClashDataStore();
const { refresh } = clashDataStore;
const { setFabVisible } = useUiCoordinator();
const { appVersion: currentVersion } = useSystemInfo();
const { isShowcaseMode } = useShowcaseMode();
const haptics = useHaptics();
const route = useRoute();
const currentRoute = computed(() => route);

// Initialize Headhunter (starts watchers for notifications/badge)
useHeadhunter();

// SYNC STATE ADAPTER: Mapping store loading/error to a unified status
const syncState = computed(() => {
  if (clashDataStore.loading) return "syncing";
  if (clashDataStore.syncError) return "error";
  return "success";
});

// Reset UI state (FAB/Dock) on ogni navigation
watch(() => route.path, () => {
  setFabVisible(false);
});

const {
  status: connectionState,
  setSuccess,
  setSyncing,
  isOnline,
} = useConnectionStatus();

watch(syncState, (newStatus, oldStatus) => {
  if (oldStatus === "syncing" && newStatus === "success") {
    setSuccess();
    haptics.success();
  }
  setSyncing(newStatus === "syncing");
});

// Trigger refresh when connection returns
watch(isOnline, (online, wasOnline) => {
  if (online && !wasOnline) {
    refresh();
  }
});

// SMART UPDATE: Automated PWA registration and update logic
const { updateServiceWorker } = useRegisterSW({
  immediate: false, // Fix: Defer registration until window.onload to prevent PSI crashes
  /**
   * Post-registration lifecycle hook.
   * Rationale: Establishes a background polling mechanism to check for
   * Service Worker updates every hour, ensuring clients don't stay stale.
   *
   * @param registration - The authoritative SW registration object.
   */
  onRegistered(registration: ServiceWorkerRegistration | undefined) {
    // Check for updates every hour
    registration &&
      setInterval(
        () => {
          registration.update();
        },
        60 * 60 * 1000,
      );
  },
  onNeedRefresh() {
    console.log("[PWA] Update available");
  },
});

onMounted(() => {
  // VERSION GUARD: Force cache busting if version mismatch detected
  const storedVersion = localStorage.getItem("app_version");

  if (storedVersion && storedVersion !== currentVersion) {
    console.log(
      `[Version] Upgrading from ${storedVersion} to ${currentVersion}`,
    );
  }
  localStorage.setItem("app_version", currentVersion);

  // AUTO-REFRESH: Listen for Service Worker activation to force a page reload.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      console.log("[PWA] New version activated, refreshing...");
      window.location.reload();
    });
  }
});
</script>

<template>
  <div class="app-shell" :class="{ 'showcase-frame': isShowcaseMode }">
    <div class="connectivity-strip" :class="connectionState"></div>

    <main class="app-container">
      <ErrorBoundary>
        <RouterView v-slot="{ Component }">
          <transition name="page" mode="out-in">
            <component :is="Component" :key="currentRoute.fullPath" />
          </transition>
        </RouterView>
      </ErrorBoundary>
    </main>

    <FloatingDock />
    <ToastContainer />
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  background-color: var(--sys-color-background);
  color: var(--sys-color-on-surface);
  overflow-x: hidden;
  transition: outline 0.3s ease;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  scrollbar-gutter: stable;
}

.app-shell.showcase-frame {
  --sys-safe-frame-offset: 1px;
  outline: 1px solid #000000;
  outline-offset: -1px;
  z-index: 9999;
}
:root.dark .app-shell.showcase-frame {
  outline: 1px solid #ffffff;
}

.app-container {
  width: 100%;
  max-width: var(--sys-layout-max-width);
  padding: 0 16px;
  transition: transform 0.2s cubic-bezier(0.2, 0, 0, 1);
  display: flex;
  flex-direction: column;
  flex: 1;
}

.connectivity-strip {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  z-index: 3000;
  opacity: 0;
  transition: all 0.4s ease;
  pointer-events: none;
}
.connectivity-strip.offline {
  background: var(--sys-color-error);
  opacity: 1;
}
.connectivity-strip.syncing {
  opacity: 1;
  background: linear-gradient(
    90deg,
    transparent,
    var(--sys-color-primary),
    transparent
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s linear infinite;
}
.connectivity-strip.success-resolve {
  background: #22c55e;
  opacity: 1;
  transform: scaleY(1.5);
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

.page-enter-active,
.page-leave-active {
  transition:
    opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.page-enter-from {
  opacity: 0;
  transform: translateY(4px);
}

.page-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
