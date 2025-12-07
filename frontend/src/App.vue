<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { RouterView, RouterLink, useRoute } from 'vue-router'
import { isConfigured, ping } from './api/gasClient'

const route = useRoute()
const isOnline = ref(true)
const apiStatus = ref<'checking' | 'online' | 'offline' | 'unconfigured'>('checking')

// Navigation items
const navItems = [
  { path: '/', name: 'leaderboard', icon: '🏆', label: 'Leaderboard' },
  { path: '/recruiter', name: 'recruiter', icon: '🔭', label: 'Recruiter' },
  { path: '/warlog', name: 'warlog', icon: '⚔️', label: 'War Log' },
  { path: '/settings', name: 'settings', icon: '⚙️', label: 'Settings' }
]

onMounted(async () => {
  // Check network status
  isOnline.value = navigator.onLine
  window.addEventListener('online', () => isOnline.value = true)
  window.addEventListener('offline', () => isOnline.value = false)
  
  // Check API status
  if (!isConfigured()) {
    apiStatus.value = 'unconfigured'
    return
  }
  
  try {
    const response = await ping()
    apiStatus.value = response.status === 'success' ? 'online' : 'offline'
  } catch {
    apiStatus.value = 'offline'
  }
})
</script>

<template>
  <div class="app-container">
    <!-- Header -->
    <header class="header">
      <div class="header-content">
        <div class="logo">
          <span class="logo-icon">👑</span>
          <span class="logo-text">Clash Manager</span>
        </div>
        
        <div class="header-status">
          <span 
            class="status-dot" 
            :class="{
              'status-online': apiStatus === 'online',
              'status-offline': apiStatus === 'offline' || apiStatus === 'unconfigured',
              'status-checking': apiStatus === 'checking'
            }"
          ></span>
          <span v-if="!isOnline" class="offline-badge">Offline</span>
        </div>
      </div>
    </header>
    
    <!-- Main Content -->
    <main class="main-content">
      <RouterView v-slot="{ Component }">
        <Transition name="page" mode="out-in">
          <component :is="Component" />
        </Transition>
      </RouterView>
    </main>
    
    <!-- Floating Dock Navigation -->
    <nav class="floating-dock">
      <RouterLink
        v-for="item in navItems"
        :key="item.name"
        :to="item.path"
        class="dock-item"
        :class="{ 'dock-item-active': route.name === item.name }"
      >
        <span class="dock-icon">{{ item.icon }}</span>
        <span class="dock-label">{{ item.label }}</span>
      </RouterLink>
    </nav>
  </div>
</template>

<style scoped>
.app-container {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
}

/* ============================================================================
   HEADER
   ============================================================================ */

.header {
  position: sticky;
  top: 0;
  z-index: 50;
  background-color: color-mix(in oklch, var(--md-sys-color-surface) 85%, transparent);
  backdrop-filter: blur(16px) saturate(180%);
  -webkit-backdrop-filter: blur(16px) saturate(180%);
  border-bottom: 1px solid var(--md-sys-color-outline-variant);
}

.header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 4rem;
  padding: 0 1rem;
  max-width: 800px;
  margin: 0 auto;
}

.logo {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.logo-icon {
  font-size: 1.5rem;
}

.logo-text {
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--md-sys-color-on-surface);
}

.header-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  transition: all 0.3s var(--md-sys-motion-easing-standard);
}

.status-online {
  background-color: var(--md-sys-color-success);
  box-shadow: 0 0 8px var(--md-sys-color-success);
}

.status-offline {
  background-color: var(--md-sys-color-error);
}

.status-checking {
  background-color: var(--md-sys-color-tertiary);
  animation: pulse-ring 1s infinite;
}

@keyframes pulse-ring {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.offline-badge {
  font-size: 0.75rem;
  color: var(--md-sys-color-error);
  font-weight: 600;
}

/* ============================================================================
   MAIN CONTENT
   ============================================================================ */

.main-content {
  flex: 1;
  padding: 1rem;
  padding-bottom: 120px; /* Space for floating dock */
  max-width: 800px;
  margin: 0 auto;
  width: 100%;
}

/* ============================================================================
   FLOATING DOCK NAVIGATION
   ============================================================================ */

.floating-dock {
  position: fixed;
  bottom: calc(24px + env(safe-area-inset-bottom, 0px));
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;
  
  display: inline-flex;
  gap: 6px;
  padding: 8px;
  
  background-color: color-mix(in oklch, var(--md-sys-color-surface-container) 90%, transparent);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  
  border-radius: var(--md-sys-shape-corner-full);
  box-shadow: var(--md-sys-elevation-3);
  border: 1px solid var(--md-sys-color-outline-variant);
}

.dock-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 10px 18px;
  
  text-decoration: none;
  color: var(--md-sys-color-on-surface-variant);
  
  border-radius: var(--md-sys-shape-corner-full);
  
  transition: all var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard);
}

.dock-item:active {
  transform: scale(0.95);
}

.dock-item-active {
  background-color: var(--md-sys-color-primary);
  color: var(--md-sys-color-on-primary);
}

.dock-icon {
  font-size: 1.25rem;
  line-height: 1;
  transition: transform var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-spring);
}

.dock-item-active .dock-icon {
  transform: scale(1.1);
}

.dock-label {
  font-size: 0.5rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* Hide labels on very small screens */
@media (max-width: 400px) {
  .dock-label {
    display: none;
  }
  
  .dock-item {
    padding: 12px 14px;
  }
}

/* ============================================================================
   PAGE TRANSITIONS
   ============================================================================ */

.page-enter-active,
.page-leave-active {
  transition: opacity var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard),
              transform var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-emphasized);
}

.page-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.page-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

/* ============================================================================
   DESKTOP LAYOUT
   ============================================================================ */

@media (min-width: 768px) {
  .floating-dock {
    bottom: 32px;
  }
  
  .main-content {
    padding-bottom: 140px;
  }
}
</style>
