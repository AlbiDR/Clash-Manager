<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { RouterView } from 'vue-router'
import { isConfigured, ping } from './api/gasClient'
import FloatingDock from './components/FloatingDock.vue'

const isOnline = ref(true)
const apiStatus = ref<'checking' | 'online' | 'offline' | 'unconfigured'>('checking')

onMounted(async () => {
  isOnline.value = navigator.onLine
  window.addEventListener('online', () => isOnline.value = true)
  window.addEventListener('offline', () => isOnline.value = false)
  
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
    <!-- Main Content -->
    <main class="main-content">
      <RouterView v-slot="{ Component }">
        <Transition name="page" mode="out-in">
          <KeepAlive>
            <component :is="Component" />
          </KeepAlive>
        </Transition>
      </RouterView>
    </main>
    
    <!-- Neo-Material Floating Dock -->
    <FloatingDock />
  </div>
</template>

<style scoped>
/* Page Transitions */
.page-enter-active,
.page-leave-active {
  transition: opacity 0.2s ease, transform 0.2s cubic-bezier(0.2, 0, 0, 1);
}

.page-enter-from { opacity: 0; transform: translateY(8px); }
.page-leave-to { opacity: 0; transform: translateY(-8px); }
</style>
