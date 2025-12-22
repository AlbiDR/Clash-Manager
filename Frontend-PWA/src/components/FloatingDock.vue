<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { useUiCoordinator } from '../composables/useUiCoordinator'
import { useHaptics } from '../composables/useHaptics'
import Icon from './Icon.vue'

const route = useRoute()
const router = useRouter()
const { dockVisible } = useUiCoordinator()
const haptics = useHaptics()

const navItems = [
  { path: '/', name: 'leaderboard', label: 'Leaderboard', icon: 'leaderboard' },
  { path: '/recruiter', name: 'recruiter', label: 'Headhunter', icon: 'recruiter' },
  { path: '/settings', name: 'settings', label: '', icon: 'settings' }
]

function navigate(path: string) {
  haptics.tap()
  router.push(path)
}
</script>

<template>
  <div class="dock-container" :class="{ 'hidden': !dockVisible }">
    <div 
      v-for="item in navItems" 
      :key="item.name"
      class="dock-item"
      :class="{ 'active': route.path === item.path }"
      @click="navigate(item.path)"
    >
      <div v-if="route.path === item.path" class="capsule-bg"></div>
      <Icon :name="item.icon" size="22" class="dock-icon" />
      <span v-if="item.label" class="dock-label">{{ item.label }}</span>
    </div>
  </div>
</template>

<style scoped>
.dock-container {
  position: fixed;
  bottom: calc(24px + env(safe-area-inset-bottom));
  left: 50%; transform: translateX(-50%);
  background: var(--sys-surface-glass);
  backdrop-filter: var(--sys-surface-glass-blur);
  -webkit-backdrop-filter: var(--sys-surface-glass-blur);
  border: 1px solid var(--sys-surface-glass-border);
  padding: 6px; 
  border-radius: var(--shape-corner-full);
  display: flex; gap: 4px;
  box-shadow: 0 12px 40px rgba(0,0,0,0.2);
  z-index: 500;
  transition: transform 0.4s var(--sys-motion-spring), opacity 0.3s ease;
}

.dock-container.hidden {
  transform: translate(-50%, 120%);
  opacity: 0;
  pointer-events: none;
}

.dock-item {
  position: relative;
  padding: 10px 20px;
  border-radius: var(--shape-corner-full);
  display: flex; align-items: center; gap: 8px;
  font-size: 14px; font-weight: 750;
  color: var(--sys-color-on-surface);
  cursor: pointer;
  transition: all 0.3s var(--sys-motion-spring);
  -webkit-tap-highlight-color: transparent;
}

.dock-item.active { color: var(--sys-color-on-primary); }

.capsule-bg {
  position: absolute;
  inset: 0;
  background: var(--sys-color-primary);
  border-radius: var(--shape-corner-full);
  z-index: -1;
  animation: slide-in 0.3s var(--sys-motion-spring);
  box-shadow: 0 4px 12px rgba(var(--sys-color-primary-rgb), 0.3);
}

@keyframes slide-in {
  from { transform: scale(0.8); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

.dock-label { transition: opacity 0.3s; }
@media (max-width: 450px) {
  .dock-item:not(.active) .dock-label { display: none; }
  .dock-item { padding: 12px; }
}
</style>
