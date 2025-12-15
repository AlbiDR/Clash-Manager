<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import Icon from './Icon.vue'

const route = useRoute()
const router = useRouter()

const navItems = [
  { path: '/', name: 'leaderboard', label: 'Leaderboard', icon: 'leaderboard' },
  { path: '/recruiter', name: 'recruiter', label: 'Headhunter', icon: 'recruiter' },
  { path: '/settings', name: 'settings', label: '', icon: 'settings' } // Removed label for icon-only look
]

function navigate(path: string) {
  if (navigator.vibrate) navigator.vibrate(10) // Small pop
  router.push(path)
}
</script>

<template>
  <div class="dock-container" @touchstart.stop>
    <div 
      v-for="item in navItems" 
      :key="item.name"
      class="dock-item"
      :class="{ 'active': route.path === item.path }"
      @click="navigate(item.path)"
    >
      <Icon :name="item.icon" size="20" :filled="route.path === item.path" />
      <span v-if="item.label" class="dock-label">{{ item.label }}</span>
    </div>
  </div>
</template>

<style scoped>
.dock-container {
  position: fixed;
  /* Bottom position + Safe Area (Home Bar) */
  bottom: calc(24px + env(safe-area-inset-bottom));
  left: 50%; transform: translateX(-50%);
  
  /* Neo-Glassmorphism */
  background: var(--sys-surface-glass);
  backdrop-filter: var(--sys-surface-glass-blur);
  -webkit-backdrop-filter: var(--sys-surface-glass-blur);
  border: 1px solid var(--sys-surface-glass-border);
  
  padding: 6px; 
  border-radius: 999px; /* Pill shape */
  display: flex; gap: 4px;
  
  box-shadow: 
    0 4px 6px -1px rgba(0, 0, 0, 0.1), 
    0 2px 4px -1px rgba(0, 0, 0, 0.06),
    0 12px 24px -4px rgba(0, 0, 0, 0.2);
    
  z-index: 200;
  max-width: calc(100% - 32px);
  overflow-x: auto;
  scrollbar-width: none;
}

.dock-container::-webkit-scrollbar { display: none; }

.dock-item {
  padding: 10px 18px; 
  border-radius: 999px;
  
  display: flex; align-items: center; gap: 8px;
  
  font-size: 14px; 
  font-weight: 600; 
  color: var(--sys-color-on-surface-variant);
  
  cursor: pointer; 
  transition: all 0.3s var(--sys-motion-spring);
  white-space: nowrap;
  position: relative;
  
  /* Remove tap highlight */
  -webkit-tap-highlight-color: transparent;
}

.dock-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.dock-item.active { 
  background: var(--sys-color-primary); 
  color: var(--sys-color-on-primary);
  font-weight: 700; 
  box-shadow: 0 4px 12px rgba(var(--sys-color-primary-rgb), 0.4);
}

.dock-label {
  display: block;
}

/* Mobile: Icon only for non-active items to save space? 
   Or just keep it tight. Let's keep labels but adjust padding. */
@media (max-width: 400px) {
  .dock-item {
    padding: 10px 14px;
    font-size: 13px;
  }
}
</style>
