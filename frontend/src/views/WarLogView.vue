<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { getWarLog } from '../api/gasClient'
import type { WarLogEntry } from '../types'
import PullToRefresh from '../components/PullToRefresh.vue'
import EmptyState from '../components/EmptyState.vue'
import ErrorState from '../components/ErrorState.vue'
import Icon from '../components/Icon.vue'
import { useModules } from '../composables/useModules'

const { modules } = useModules()
const isModuleEnabled = computed(() => modules.value.warLog)

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
  if (result === 'win') return 'var(--sys-color-primary)'
  return 'var(--sys-color-error)'
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
.warlog-view {
  padding: 24px 16px 120px 16px;
  max-width: 600px;
  margin: 0 auto;
}

.top-app-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.page-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--sys-color-on-surface);
}

.icon-btn {
  background: none;
  border: none;
  color: var(--sys-color-on-surface-variant);
  cursor: pointer;
  padding: 8px;
  border-radius: 50%;
  transition: background-color 0.2s;
}

.icon-btn:hover {
  background-color: var(--sys-color-surface-container-high);
}

.spin {
  animation: spin 1s linear infinite;
}

/* Summary Card */
.summary-card {
  background: var(--sys-surface-glass);
  backdrop-filter: var(--sys-surface-glass-blur);
  -webkit-backdrop-filter: var(--sys-surface-glass-blur);
  border: 1px solid var(--sys-surface-glass-border);
  border-radius: var(--shape-corner-l);
  padding: 16px;
  margin-bottom: 24px;
  box-shadow: var(--sys-elevation-1);
}

.summary-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.summary-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
}

.summary-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--sys-color-primary);
  font-family: var(--sys-typescale-mono);
}

.summary-label {
  font-size: 11px;
  text-transform: uppercase;
  color: var(--sys-color-outline);
  font-weight: 600;
  margin-top: 4px;
}

.summary-divider {
  width: 1px;
  height: 32px;
  background-color: var(--sys-color-outline-variant);
}

/* Log List */
.log-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.log-card {
  background: var(--sys-color-surface-container-low);
  border-radius: var(--shape-corner-m);
  padding: 12px;
  display: flex;
  align-items: center;
  gap: 16px;
  transition: transform 0.2s;
}

.log-card:active {
  transform: scale(0.98);
}

.position-indicator {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  color: #fff;
  font-size: 18px;
  flex-shrink: 0;
}

.log-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.log-date {
  font-weight: 600;
  color: var(--sys-color-on-surface);
}

.log-participants {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--sys-color-outline);
}

.log-score {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--sys-color-on-surface-variant);
}

.score-val {
  font-weight: 700;
  font-family: var(--sys-typescale-mono);
}

/* Skeletons */
.skeleton-log {
  height: 64px;
  background: var(--sys-color-surface-container-high);
  border-radius: var(--shape-corner-m);
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0% { opacity: 1; }
  50% { opacity: 0.5; }
  100% { opacity: 1; }
}

@keyframes spin {
  100% { transform: rotate(360deg); }
}
</style>
