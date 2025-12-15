// src/composables/useApiState.ts
import { ref } from 'vue'
import { isConfigured, ping, getApiUrl } from '../api/gasClient'
import type { PingResponse } from '../types'

// Global Shared State
const apiUrl = ref('')
const apiConfigured = ref(false)
const apiStatus = ref<'checking' | 'online' | 'offline' | 'unconfigured'>('checking')
const pingData = ref<PingResponse | null>(null)

let isInitialized = false

async function checkApiStatus() {
    apiStatus.value = 'checking'
    apiConfigured.value = isConfigured()
    apiUrl.value = getApiUrl() 

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
    function init() {
        if (!isInitialized) {
            checkApiStatus()
            isInitialized = true
        }
    }

    return {
        apiUrl,
        apiConfigured,
        apiStatus,
        pingData,
        checkApiStatus,
        init
    }
}
