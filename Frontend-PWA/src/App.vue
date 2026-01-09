<script setup lang="ts">
import { ref, onMounted, computed, watch } from "vue";
import { RouterView, useRoute } from "vue-router";
import { useClanData } from "./composables/useClanData";
import { useHaptics } from "./composables/useHaptics";
import { usePullToRefresh } from "./composables/usePullToRefresh";
import FloatingDock from "./components/FloatingDock.vue";
import ToastContainer from "./components/ToastContainer.vue";
import ErrorBoundary from "./components/ErrorBoundary.vue";

const { syncStatus, refresh } = useClanData();
const haptics = useHaptics();
const route = useRoute();
const currentRoute = computed(() => route);
const isOnline = ref(true);
const isSuccessFading = ref(false);

const { pullDistance, isRefreshing: isPullRefreshing } = usePullToRefresh(refresh);

// `isStandalone` logic removed to clear unused warning

watch(syncStatus, (newStatus, oldStatus) => {
  if (oldStatus === "syncing" && newStatus === "success") {
    isSuccessFading.value = true;
    haptics.success();
    setTimeout(() => {
      isSuccessFading.value = false;
    }, 1800);
  }
});

onMounted(() => {
  isOnline.value = navigator.onLine;

  window.addEventListener("online", () => {
    isOnline.value = true;
    haptics.success();
  });
  window.addEventListener("offline", () => {
    isOnline.value = false;
    haptics.error();
  });
});

const connectionState = computed(() => {
  if (!isOnline.value) return "offline";
  if (isSuccessFading.value) return "success-resolve";
  if (syncStatus.value === "syncing" || isPullRefreshing.value) return "syncing";
  return "online";
});
</script>

<template>
  <div class="app-shell">
    <div class="connectivity-strip" :class="connectionState"></div>

    <!-- Pull-to-Refresh Indicator -->
    <div 
      class="pull-indicator" 
      :style="{ transform: `translateY(${pullDistance}px) rotate(${pullDistance * 2}deg)`, opacity: pullDistance / 60 }"
    >
      <svg viewBox="0 0 24 24" width="24" height="24">
        <path fill="currentColor" d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35Z"/>
      </svg>
    </div>

    <main class="app-container" :style="{ transform: `translateY(${pullDistance}px)` }">
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

.app-container {
  max-width: var(--sys-layout-max-width);
  margin: 0 auto;
  padding: 0 16px;
  transition: transform 0.2s cubic-bezier(0.2, 0, 0, 1);
  will-change: transform;
}

.pull-indicator {
  position: fixed;
  top: 10px;
  left: 50%;
  margin-left: -20px;
  z-index: 1000;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--sys-color-surface);
  color: var(--sys-color-primary);
  box-shadow: var(--sys-shadow-lg);
  backdrop-filter: blur(12px);
  pointer-events: none;
  transition: opacity 0.2s;
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
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* 🎭 View Transitions Fallback (Fade + Slightly Slide) */
.page-enter-active,
.page-leave-active {
  transition: opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1), transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
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

