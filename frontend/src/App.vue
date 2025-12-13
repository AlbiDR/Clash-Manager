<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { RouterView } from 'vue-router'
import { useApiState } from './composables/useApiState'
import FloatingDock from './components/FloatingDock.vue'

// 1. Initialize API state to run the check
useApiState() 

const isOnline = ref(true)

onMounted(() => {
    isOnline.value = navigator.onLine
    window.addEventListener('online', () => isOnline.value = true)
    window.addEventListener('offline', () => isOnline.value = false)
})
</script>

<template>
  <div class="app-container">
    <main class="main-content">
      <RouterView v-slot="{ Component }">
        <Transition name="page" mode="out-in">
          <KeepAlive>
            <component :is="Component" />
          </KeepAlive>
        </Transition>
      </RouterView>
    </main>
    
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
