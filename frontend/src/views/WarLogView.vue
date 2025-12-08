<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { getWarLog } from '../api/gasClient'
import type { WarLogEntry } from '../types'
import PullToRefresh from '../components/PullToRefresh.vue'
import EmptyState from '../components/EmptyState.vue'
import ErrorState from '../components/ErrorState.vue'
import Icon from '../components/Icon.vue'
import { useModules } from '../composables/useModules' // ✅ NEW IMPORT

const { modules } = useModules() // Use the composable
const isModuleEnabled = computed(() => modules.value.warLog) // Check module state

const logs = ref<WarLogEntry[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

// Stats
const seasonStats = computed(() => {
  const wins = logs.value.filter(l => l.result === 'win').length
  const total = logs.value.length
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0
  const totalFame = logs.value.reduce((sum, l) => sum + l.score, 0)
  
  return { wins, total, winRate, totalFame }
})

async function loadData() {
  loading.value = true
  error.value = null
  try {
    const response = await getWarLog()
    if (response.status === 'success' && response.data) {
      logs.value = response.data
    } else {
      error.value = response.error?.message || 'Failed to load war log'
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Network error'
  } finally {
    loading.value = false
  }
}

function getDayLabel(isoString: string) {
  const date = new Date(isoString)
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

function getResultColor(result: string) {
  if (result === 'win') return 'var(--md-sys-color-primary)' // Green/Primary
  return 'var(--md-sys-color-error)' // Red/Error
}

onMounted(() => {
    // Only load data if the module is enabled
    if (isModuleEnabled.value) {
        loadData()
    }
})
</script>

<template>
  <div class="warlog-view">
    <div v-if="!isModuleEnabled">
        <EmptyState
            icon="🔒"
            message="War Log module is disabled"
            hint="You can enable this feature in the Settings page."
        />
    </div>
    <div v-else>
        <PullToRefresh @refresh="loadData" />
    
                <header class="top-app-bar">
          <h1 class="page-title">War History</h1>
          <div class="actions">
           <button 
              class="icon-btn"
              @click="loadData"
              :disabled="loading"
              v-tooltip="'Refresh'"
            >
              <Icon name="refresh" :class="{ 'spin': loading }" />
            </button>
          </div>
        </header>

                <div class="summary-card animate-fade-in" v-if="!loading && !error && logs.length > 0">
          <div class="summary-row">
            <div class="summary-item">
              <span class="summary-value">{{ seasonStats.winRate }}%</span>
              <span class="summary-label">Win Rate</span>
            </div>
            <div class="summary-divider"></div>
            <div class="summary-item">
              <span class="summary-value">{{ seasonStats.wins }}</span>
              <span class="summary-label">Wins</span>
            </div>
            <div class="summary-divider"></div>
            <div class="summary-item">
              <span class="summary-value">{{ seasonStats.totalFame.toLocaleString() }}</span>
              <span class="summary-label">Total Fame</span>
            </div>
          </div>
        </div>
    
                <ErrorState 
          v-if="error" 
          :message="error" 
          @retry="loadData" 
        />
    
                <div v-else-if="loading" class="log-list">
          <div v-for="i in 5" :key="i" class="skeleton-log"></div>
        </div>
    
                <EmptyState 
          v-else-if="logs.length === 0"
          message="No war history found"
          hint="Complete a war to see data here"
        />
    
                <div v-else class="log-list stagger-children">
          <div 
            v-for="entry in logs" 
            :key="entry.endTime"
            class="log-card"
          >
                        <div class="position-indicator" :style="{ backgroundColor: getResultColor(entry.result) }">
              <span class="pos-number">{{ entry.result === 'win' ? 'W' : 'L' }}</span>
            </div>
        
                        <div class="log-info">
              <span class="log-date">{{ getDayLabel(entry.endTime) }}</span>
              <div class="log-participants">
                <Icon name="group" size="14" />
                <span>{{ entry.teamSize }} vs {{ entry.opponent }}</span>
              </div>
            </div>
        
                        <div class="log-score">
              <span class="score-val">{{ entry.score.toLocaleString() }}</span>
              <Icon name="trophy" size="14" />
            </div>
          </div>
        </div>
    </div>
  </div>
</template>

<style scoped>
/* All styles remain the same */
.warlog-view {
...
}
/* ... */
</style>