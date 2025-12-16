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
  <div class="dock-container" @touchstart.stop>
    <div 
      v-for="item in navItems" 
      :key="item.name"
      class="dock-item"
      :class="{ 'active': route.path === item.path }"
      @click="navigate(item.path)"
    >
      <div v-if="route.path === item.path" class="glow-bg"></div>
      <Icon :name="item.icon" size="22" :filled="route.path === item.path" class="dock-icon" />
      <span v-if="item.label" class="dock-label">{{ item.label }}</span>
    </div>
  </div>
</template>

<style scoped>
.dock-container {
  position: fixed;
  bottom: calc(24px + env(safe-area-inset-bottom));
  left: 50%; transform: translateX(-50%);
  
  /* Richer Glass Effect */
  background: var(--sys-surface-glass);
  backdrop-filter: var(--sys-surface-glass-blur);
  -webkit-backdrop-filter: var(--sys-surface-glass-blur);
  border: 1px solid var(--sys-surface-glass-border);
  
  padding: 5px; 
  border-radius: 999px;
  display: flex; gap: 4px;
  
  box-shadow: 
    0 8px 32px -4px rgba(0, 0, 0, 0.15),
    0 2px 4px -1px rgba(0, 0, 0, 0.05);
    
  z-index: 200;
  max-width: calc(100% - 32px);
}

.dock-item {
  position: relative;
  padding: 10px 20px; 
  border-radius: 999px;
  display: flex; align-items: center; gap: 8px;
  font-size: 14px; 
  font-weight: 600; 
  color: var(--sys-color-on-surface-variant);
  cursor: pointer; 
  transition: color 0.3s ease;
  white-space: nowrap;
  -webkit-tap-highlight-color: transparent;
  overflow: hidden; /* For glow clipping */
}

.dock-item.active { 
  color: var(--sys-color-on-primary);
  font-weight: 700;
}

/* Glowing Pill Background */
.glow-bg {
  position: absolute;
  inset: 0;
  background: var(--sys-color-primary);
  border-radius: 999px;
  z-index: -1;
  animation: fadeSlideIn 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
  box-shadow: 0 4px 12px rgba(var(--sys-color-primary-rgb), 0.4);
}

.dock-icon {
  position: relative; z-index: 2;
}

.dock-label {
  display: block;
  position: relative; z-index: 2;
}

@media (max-width: 400px) {
  .dock-item {
    padding: 10px 14px;
    font-size: 13px;
  }
}
</style>
