// src/composables/useApiState.ts
import { ref, onMounted } from 'vue'
import { isConfigured, ping, getApiUrl } from '../api/gasClient'
// You will also need to define or import the PingResponse type
import type { PingResponse } from '../types'

// Global Shared State (REPLACING the refs in App.vue and SettingsView.vue)
const apiUrl = ref('')
const apiConfigured = ref(false)
const apiStatus = ref<'checking' | 'online' | 'offline' | 'unconfigured'>('checking')
const pingData = ref<PingResponse | null>(null)

let isInitialized = false

async function checkApiStatus() {
    apiStatus.value = 'checking'
    apiConfigured.value = isConfigured()
    apiUrl.value = getApiUrl() // Assuming getApiUrl() is available and returns the URL

    if (!apiConfigured.value) {
        apiStatus.value = 'unconfigured'
        return
    }

    try {
        const start = Date.now()
        const response = await ping()
        const latency = Date.now() - start

        if (response.status === 'success' && response.data) {
            apiStatus.value = 'online'
            pingData.value = {
                ...response.data,
                latency
            }
        } else {
            apiStatus.value = 'offline'
        }
    } catch {
        apiStatus.value = 'offline'
    }
}

export function useApiState() {
    if (!isInitialized) {
        // Run initial status check when the composable is first called
        onMounted(checkApiStatus)
        isInitialized = true
    }

    return {
        apiUrl,
        apiConfigured,
        apiStatus,
        pingData,
        checkApiStatus, // Expose a method to manually refresh (used by SettingsView)
    }
}