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
    <header class="header glass">
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
    <main class="main-content safe-bottom">
      <RouterView v-slot="{ Component }">
        <Transition name="page" mode="out-in">
          <component :is="Component" />
        </Transition>
      </RouterView>
    </main>
    
    <!-- Bottom Navigation (Mobile-first) -->
    <nav class="bottom-nav glass">
      <RouterLink
        v-for="item in navItems"
        :key="item.name"
        :to="item.path"
        class="nav-item"
        :class="{ 'nav-item-active': route.name === item.name }"
      >
        <span class="nav-icon">{{ item.icon }}</span>
        <span class="nav-label">{{ item.label }}</span>
      </RouterLink>
    </nav>
  </div>
</template>

<style scoped>
.app-container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

/* Header */
.header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: var(--cr-nav-height);
  z-index: 100;
}

.header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 100%;
  padding: 0 1rem;
  max-width: 1200px;
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
  background: var(--cr-gradient-primary);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
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
  transition: background-color 0.3s;
}

.status-online {
  background: var(--cr-victory);
  box-shadow: 0 0 8px var(--cr-victory);
}

.status-offline {
  background: var(--cr-defeat);
}

.status-checking {
  background: var(--cr-gold);
  animation: pulse-glow 1s infinite;
}

.offline-badge {
  font-size: 0.75rem;
  color: var(--cr-defeat);
  font-weight: 600;
}

/* Main Content */
.main-content {
  flex: 1;
  padding: calc(var(--cr-nav-height) + 1rem) 1rem 1rem;
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
}

/* Bottom Navigation */
.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: var(--cr-bottom-nav-height);
  display: flex;
  justify-content: space-around;
  align-items: center;
  z-index: 100;
  padding-bottom: env(safe-area-inset-bottom, 0);
}

.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 0.5rem 1rem;
  text-decoration: none;
  color: var(--cr-text-muted);
  transition: all 0.2s ease;
  border-radius: 0.75rem;
}

.nav-item:hover {
  color: var(--cr-text-secondary);
}

.nav-item-active {
  color: var(--cr-primary-light);
  background: rgba(99, 102, 241, 0.1);
}

.nav-icon {
  font-size: 1.25rem;
  transition: transform 0.2s ease;
}

.nav-item-active .nav-icon {
  transform: scale(1.1);
}

.nav-label {
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* Page Transitions */
.page-enter-active,
.page-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.page-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.page-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* Desktop: Hide bottom nav, show as sidebar */
@media (min-width: 768px) {
  .bottom-nav {
    top: var(--cr-nav-height);
    bottom: auto;
    left: 0;
    right: auto;
    width: 5rem;
    height: auto;
    flex-direction: column;
    justify-content: flex-start;
    padding: 1rem 0.5rem;
    gap: 0.5rem;
    border-radius: 0 1rem 1rem 0;
  }
  
  .main-content {
    padding-left: 6rem;
  }
  
  .nav-item {
    width: 100%;
  }
}
</style>
