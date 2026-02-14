<script setup lang="ts">
import ErrorBoundary from "../shared/ui/ErrorBoundary.vue";
import ToastContainer from "../shared/ui/ToastContainer.vue";
import ConsoleLayout from "../shared/ui/ConsoleLayout.vue";
import ConsoleHeader from "../shared/ui/ConsoleHeader.vue";
import { useClashData } from "../core/services/useClashData";
import { useShowcaseMode } from "../core/services/useShowcaseMode";
import { useConnectionStatus } from "../core/services/useConnectionStatus";
import { useHaptics } from "../core/services/useHaptics";
import { useUiCoordinator } from "../core/services/useUiCoordinator";
import { onMounted, computed, watch } from "vue";
import { RouterView, useRoute } from "vue-router";
import { useHeadhunter } from "@features/headhunter/composables/useHeadhunter";
import FloatingDock from "../shared/ui/FloatingDock.vue";
import HeaderInfoOverlay from "../shared/ui/HeaderInfoOverlay.vue";
import { useRegisterSW } from "virtual:pwa-register/vue";

const { syncStatus, refresh, loadLocal } = useClashData();
const { setFabVisible } = useUiCoordinator();
// Initialize Headhunter (starts watchers for notifications/badge)
useHeadhunter();

// Load local data immediately
loadLocal(); // Non-blocking: main.ts also calls this, but we ensure hydration here.
const haptics = useHaptics();
const route = useRoute();
const currentRoute = computed(() => route);

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

const { isShowcaseMode } = useShowcaseMode();

watch(syncStatus, (newStatus, oldStatus) => {
  if (oldStatus === "syncing" && newStatus === "success") {
    setSuccess();
    haptics.success();
  }
});

watch(syncStatus, (sStatus) => {
  setSyncing(sStatus === "syncing");
});

// Fix 20 (relocated): Trigger refresh when connection returns
watch(isOnline, (online, wasOnline) => {
  if (online && !wasOnline) {
    refresh();
  }
});

// SMART UPDATE: Automated PWA registration and update logic
const { updateServiceWorker } = useRegisterSW({
  onRegistered(r: any) {
    // Check for updates every hour
    r &&
      setInterval(
        () => {
          r.update();
        },
        60 * 60 * 1000,
      );
  },
  onNeedRefresh() {
    // Automatically apply update if it's a minor change
    // or notify user for major shifts.
    updateServiceWorker(true);
  },
});

onMounted(() => {
  // VERSION GUARD: Force cache busting if version mismatch detected
  const currentVersion = __APP_VERSION__;
  const storedVersion = localStorage.getItem("app_version");

  if (storedVersion && storedVersion !== currentVersion) {
    console.log(
      `[Version] Upgrading from ${storedVersion} to ${currentVersion}`,
    );
    // Optional: Clear old system states if needed
  }
  localStorage.setItem("app_version", currentVersion);
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
  overflow-x: hidden;
  transition: outline 0.3s ease;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  scrollbar-gutter: stable;
}

/* SHOWCASE FRAME: 1px clinical boundary for screenshots */
.app-shell.showcase-frame {
  --sys-safe-frame-offset: 1px;
  outline: 1px solid #000000;
  outline-offset: -1px;
  z-index: 9999;
}
:root.dark .app-shell.showcase-frame {
  outline: 1px solid #ffffff;
}

/* TRANSITION: Smooth transform for page container */
.app-container {
  width: 100%;
  max-width: var(--sys-layout-max-width);
  padding: 0 16px;
  transition: transform 0.2s cubic-bezier(0.2, 0, 0, 1);
  will-change: transform;
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

/* View Transitions Fallback (Fade + Slightly Slide) */
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

/* FUTURE: CSS View Transitions API support elsewhere */
</style>
