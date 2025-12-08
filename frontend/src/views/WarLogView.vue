<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { getWarLog } from '../api/gasClient'
import type { WarLogEntry } from '../types'
import PullToRefresh from '../components/PullToRefresh.vue'
import EmptyState from '../components/EmptyState.vue'
import ErrorState from '../components/ErrorState.vue'
import Icon from '../components/Icon.vue'

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

onMounted(loadData)
</script>

<template>
  <div class="warlog-view">
    <PullToRefresh @refresh="loadData" />
    
    <!-- Top App Bar -->
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

    <!-- Season Summary Card -->
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
    
    <!-- Error State -->
    <ErrorState 
      v-if="error" 
      :message="error" 
      @retry="loadData" 
    />
    
    <!-- Loading State -->
    <div v-else-if="loading" class="log-list">
      <div v-for="i in 5" :key="i" class="skeleton-log"></div>
    </div>
    
    <!-- Empty State -->
    <EmptyState 
      v-else-if="logs.length === 0"
      message="No war history found"
      hint="Complete a war to see data here"
    />
    
    <!-- Log List -->
    <div v-else class="log-list stagger-children">
      <div 
        v-for="entry in logs" 
        :key="entry.endTime"
        class="log-card"
      >
        <!-- Left: Result Indicator -->
        <div class="position-indicator" :style="{ backgroundColor: getResultColor(entry.result) }">
          <span class="pos-number">{{ entry.result === 'win' ? 'W' : 'L' }}</span>
        </div>
        
        <!-- Center: Date & Participants -->
        <div class="log-info">
          <span class="log-date">{{ getDayLabel(entry.endTime) }}</span>
          <div class="log-participants">
            <Icon name="group" size="14" />
            <span>{{ entry.teamSize }} vs {{ entry.opponent }}</span>
          </div>
        </div>
        
        <!-- Right: Score -->
        <div class="log-score">
          <span class="score-val">{{ entry.score.toLocaleString() }}</span>
          <Icon name="trophy" size="14" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.warlog-view {
  min-height: 100vh;
  padding-bottom: 120px;
}

/* Duplicated Top Bar Styles (Should act. correspond to global styles if possible) */
.top-app-bar {
  position: sticky;
  top: 0;
  z-index: 50;
  background: var(--md-sys-color-surface);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 1rem;
  height: 64px;
}

.page-title {
  font-size: 1.375rem;
  font-weight: 500;
  margin: 0;
}

.icon-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--md-sys-color-on-surface);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.spin { animation: spin 1s linear infinite; }
@keyframes spin { 100% { transform: rotate(360deg); } }

/* Summary Card */
.summary-card {
  margin: 1rem;
  background: var(--md-sys-color-primary-container);
  color: var(--md-sys-color-on-primary-container);
  border-radius: var(--md-sys-shape-corner-large);
  padding: 1.5rem 1rem;
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
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1.2;
}

.summary-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  opacity: 0.8;
  letter-spacing: 0.05em;
}

.summary-divider {
  width: 1px;
  height: 2rem;
  background: var(--md-sys-color-on-primary-container);
  opacity: 0.2;
}

/* Log List */
.log-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0 1rem;
}

.log-card {
  display: flex;
  align-items: center;
  background: var(--md-sys-color-surface-container);
  border-radius: 1rem;
  overflow: hidden;
  height: 72px; /* Fixed height for consistency */
}

.position-indicator {
  width: 3.5rem;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 700;
  font-size: 1.125rem;
}

.log-info {
  flex: 1;
  padding: 0 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.log-date {
  font-weight: 600;
  color: var(--md-sys-color-on-surface);
}

.log-participants {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  color: var(--md-sys-color-on-surface-variant);
}

.log-score {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding-right: 1.25rem;
  font-weight: 700;
  color: var(--md-sys-color-on-surface);
}

.skeleton-log {
  height: 72px;
  border-radius: 1rem;
  background: var(--md-sys-color-surface-container);
  animation: pulse 1.5s infinite;
}
</style>
