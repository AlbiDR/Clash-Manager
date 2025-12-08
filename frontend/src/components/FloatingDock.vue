<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { appSettings } from '../stores/appSettings'

const route = useRoute()
const router = useRouter()

const allNavItems = [
  { path: '/', name: 'leaderboard', label: '🏆 Leaderboard', module: null },
  { path: '/recruiter', name: 'recruiter', label: '🔭 Headhunter', module: null },
  { path: '/warlog', name: 'warlog', label: '⚔️ War Log', module: 'warLog' as const },
  { path: '/settings', name: 'settings', label: '⚙️ Settings', module: null }
]

const navItems = computed(() => {
  return allNavItems.filter(item => {
    if (item.module === null) return true
    return appSettings.modules[item.module]
  })
})

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
      <span>{{ item.label }}</span>
    </div>
  </div>
</template>

<style scoped>
.dock-container {
  position: fixed;
  /* Bottom position + Safe Area (Home Bar) */
  bottom: calc(32px + env(safe-area-inset-bottom));
  left: 50%; transform: translateX(-50%);
  background: var(--sys-surface-glass);
  backdrop-filter: var(--sys-surface-glass-blur); -webkit-backdrop-filter: var(--sys-surface-glass-blur);
  padding: 6px; border-radius: var(--shape-corner-full);
  display: flex; gap: 6px;
  box-shadow: var(--sys-elevation-3);
  border: 1px solid var(--sys-surface-glass-border);
  z-index: 200;
  max-width: calc(100% - 32px);
  overflow-x: auto;
  scrollbar-width: none;
}

.dock-container::-webkit-scrollbar { display: none; }

.dock-item {
  padding: 14px 20px; border-radius: var(--shape-corner-full);
  font-size: 15px; font-weight: 600; color: var(--sys-color-on-surface-variant);
  cursor: pointer; transition: all 0.3s var(--sys-motion-spring);
  display: flex; align-items: center; gap: 8px;
  white-space: nowrap;
}

.dock-item.active { 
  background: var(--sys-color-on-surface); 
  color: var(--sys-color-surface); 
  font-weight: 700; 
  /* Interaction Layer: Glow effect */
  box-shadow: 0 0 15px rgba(var(--sys-color-primary-rgb), 0.3);
  transform: translateY(-2px);
}

/* Mobile Adjustment: Tighter padding if many items */
@media (max-width: 480px) {
  .dock-item { padding: 12px 16px; font-size: 14px; }
}
</style>
