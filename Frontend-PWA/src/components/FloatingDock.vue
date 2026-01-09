<script setup lang="ts">
import { useRoute, useRouter } from "vue-router";
import { useUiCoordinator } from "../composables/useUiCoordinator";
import { useHaptics } from "../composables/useHaptics";
import Icon from "./Icon.vue";

const route = useRoute();
const router = useRouter();
const { dockVisible } = useUiCoordinator();
const haptics = useHaptics();

const navItems = [
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
  { path: "/settings", name: "settings", label: "Settings", icon: "settings" },
];

function navigate(path: string) {
  if (route.path === path) return;
  haptics.tap();
  router.push(path);
}
</script>

<template>
  <div class="dock-container" :class="{ hidden: !dockVisible }">
    <button
      v-for="item in navItems"
      :key="item.name"
      class="dock-item"
      :class="{ active: route.path === item.path }"
      @click="navigate(item.path)"
      :aria-label="item.label"
    >
      <div v-if="route.path === item.path" class="capsule-bg"></div>
      <Icon :name="item.icon" size="22" class="dock-icon" />
      <span v-if="item.label && item.label !== 'Settings'" class="dock-label">{{
        item.label
      }}</span>
    </button>
  </div>
</template>

<style scoped>
.dock-container {
  position: fixed;
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
  transition:
    transform 0.5s cubic-bezier(0.2, 0, 0, 1),
    opacity 0.3s ease;
}

.dock-container.hidden {
  transform: translate(-50%, 150%);
  opacity: 0;
  pointer-events: none;
}

.dock-item {
  position: relative;
  padding: 10px 20px;
  border-radius: var(--shape-corner-full);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 750;
  color: var(--sys-color-on-surface);
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.2, 0, 0, 1);
  -webkit-tap-highlight-color: transparent;

  background: none;
  border: none;
  font-family: inherit;
}

.dock-item.active {
  color: var(--sys-color-on-primary);
}

.capsule-bg {
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, var(--sys-color-primary), var(--sys-color-primary-variant, var(--sys-color-primary)));
  border-radius: var(--shape-corner-full);
  z-index: -1;
  animation: pop-in 0.4s cubic-bezier(0.2, 0, 0, 1.2);
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
}

@media (max-width: 480px) {
  .dock-item:not(.active) .dock-label {
    display: none;
  }
  .dock-item {
    padding: 12px 16px;
  }
  .dock-item.active {
    padding: 12px 24px;
  }
}
</style>

