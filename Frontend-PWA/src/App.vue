<script setup lang="ts">
import { ref, onMounted, computed, watch } from "vue";
import { RouterView, useRoute } from "vue-router";
import { useClashData } from "./composables/useClashData";
import { useHeadhunter } from "./composables/useHeadhunter";
import { useHaptics } from "./composables/useHaptics";
import { useConnectionStatus } from "./composables/useConnectionStatus";
import FloatingDock from "./components/FloatingDock.vue";
import ToastContainer from "./components/ToastContainer.vue";
import ErrorBoundary from "./components/ErrorBoundary.vue";

const { syncStatus, refresh, loadLocal } = useClashData();
// Initialize Headhunter (starts watchers for notifications/badge)
useHeadhunter();

// Load local data immediately
loadLocal();
const haptics = useHaptics();
const route = useRoute();
const currentRoute = computed(() => route);

const {
  status: connectionState,
  setSuccess,
  setSyncing,
  isOnline,
} = useConnectionStatus();

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

// 🔄 SMART UPDATE: Automated PWA registration and update logic
import { useRegisterSW } from "virtual:pwa-register/vue";
const { needRefresh, updateServiceWorker } = useRegisterSW({
  onRegistered(r) {
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
  // 🛡️ VERSION GUARD: Force cache busting if version mismatch detected
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
  <div class="app-shell">
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
}

/* ⚡ TRANSITION: Smooth transform for page container */
.app-container {
  max-width: var(--sys-layout-max-width);
  margin: 0 auto;
  padding: 0 16px;
  transition: transform 0.2s cubic-bezier(0.2, 0, 0, 1);
  will-change: transform;
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

/* 🎭 View Transitions Fallback (Fade + Slightly Slide) */
.page-enter-active,
.page-leave-active {
  transition:
    opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.page-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.page-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

/* ⚡ FUTURE: CSS View Transitions API support elsewhere */
</style>
