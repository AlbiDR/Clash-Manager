<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import Icon from './Icon.vue'

const route = useRoute()
const router = useRouter()

const navItems = [
  { path: '/', name: 'leaderboard', label: 'Leaderboard', icon: 'leaderboard' },
  { path: '/recruiter', name: 'recruiter', label: 'Headhunter', icon: 'recruiter' },
  { path: '/settings', name: 'settings', label: '', icon: 'settings' }
]

function navigate(path: string) {
  if (navigator.vibrate) navigator.vibrate(10)
  router.push(path)
}
</script>

<template>
  <div class="dock-container">
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
  border-radius: 100px;
  display: flex; gap: 4px;
  box-shadow: 0 12px 40px rgba(0,0,0,0.2);
  z-index: 500;
}

.dock-item {
  position: relative;
  padding: 10px 20px;
  border-radius: 100px;
  display: flex; align-items: center; gap: 8px;
  font-size: 14px; font-weight: 700;
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
  border-radius: 100px;
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
