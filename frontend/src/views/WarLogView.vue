<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { getWarLog } from '../api/gasClient'
import type { WarLogEntry } from '../types'

const warLog = ref<WarLogEntry[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

// Stats
const stats = computed(() => {
  const wins = warLog.value.filter(w => w.result === 'win').length
  const losses = warLog.value.filter(w => w.result === 'lose').length
  const total = wins + losses
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0
  
  return { wins, losses, winRate, total: warLog.value.length }
})

async function loadData() {
  loading.value = true
  error.value = null
  
  try {
    const response = await getWarLog()
    if (response.status === 'success' && response.data) {
      warLog.value = response.data
    } else {
      error.value = response.error?.message || 'Failed to load data'
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Network error'
  } finally {
    loading.value = false
  }
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric',
    year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
  })
}

onMounted(loadData)
</script>

<template>
  <div class="warlog-view">
    <!-- Stats Summary -->
    <div class="stats-bar glass-card animate-fade-in">
      <div class="stat">
        <span class="stat-value stat-wins">{{ stats.wins }}</span>
        <span class="stat-label">Wins</span>
      </div>
      <div class="stat">
        <span class="stat-value stat-losses">{{ stats.losses }}</span>
        <span class="stat-label">Losses</span>
      </div>
      <div class="stat">
        <span class="stat-value">{{ stats.winRate }}%</span>
        <span class="stat-label">Win Rate</span>
      </div>
    </div>
    
    <!-- Refresh Button -->
    <div class="controls animate-fade-in" style="animation-delay: 0.1s">
      <h2 class="section-title">Battle History</h2>
      <button class="btn btn-secondary" @click="loadData" :disabled="loading">
        {{ loading ? '...' : '🔄' }}
      </button>
    </div>
    
    <!-- Error State -->
    <div v-if="error" class="error-state glass-card">
      <span class="error-icon">⚠️</span>
      <p>{{ error }}</p>
      <button class="btn btn-primary" @click="loadData">Retry</button>
    </div>
    
    <!-- Loading State -->
    <div v-else-if="loading" class="war-list stagger-children">
      <div v-for="i in 6" :key="i" class="skeleton-card glass-card">
        <div class="skeleton" style="width: 60px; height: 60px; border-radius: 0.5rem;"></div>
        <div class="skeleton-content">
          <div class="skeleton" style="width: 70%; height: 1rem; margin-bottom: 0.5rem;"></div>
          <div class="skeleton" style="width: 50%; height: 0.75rem;"></div>
        </div>
      </div>
    </div>
    
    <!-- Empty State -->
    <div v-else-if="warLog.length === 0" class="empty-state glass-card">
      <span class="empty-icon">⚔️</span>
      <p>No war history available</p>
    </div>
    
    <!-- War Log List -->
    <div v-else class="war-list stagger-children">
      <div 
        v-for="(war, index) in warLog" 
        :key="index"
        class="war-card glass-card"
        :class="{ 
          'war-win': war.result === 'win', 
          'war-lose': war.result === 'lose',
          'war-na': war.result === 'n/a'
        }"
      >
        <!-- Result Badge -->
        <div class="result-badge" :class="`result-${war.result}`">
          <span v-if="war.result === 'win'">🏆</span>
          <span v-else-if="war.result === 'lose'">💀</span>
          <span v-else>—</span>
        </div>
        
        <!-- War Details -->
        <div class="war-details">
          <div class="war-header">
            <span class="opponent-name">vs {{ war.opponent }}</span>
            <span class="war-date">{{ formatDate(war.endTime) }}</span>
          </div>
          
          <div class="score-comparison">
            <span class="our-score">{{ war.score.toLocaleString() }}</span>
            <span class="score-separator">-</span>
            <span class="their-score">{{ war.opponentScore.toLocaleString() }}</span>
          </div>
        </div>
        
        <!-- Result Text -->
        <div class="result-text">
          <span class="badge" :class="`badge-${war.result === 'win' ? 'victory' : war.result === 'lose' ? 'defeat' : 'member'}`">
            {{ war.result === 'win' ? 'Victory' : war.result === 'lose' ? 'Defeat' : 'N/A' }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.warlog-view {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* Stats Bar */
.stats-bar {
  display: flex;
  justify-content: space-around;
  padding: 1.25rem 1rem;
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
}

.stat-value {
  font-size: 1.75rem;
  font-weight: 700;
  background: var(--cr-gradient-primary);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.stat-wins {
  background: linear-gradient(135deg, #10b981 0%, #34d399 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.stat-losses {
  background: linear-gradient(135deg, #ef4444 0%, #f87171 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.stat-label {
  font-size: 0.75rem;
  color: var(--cr-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* Controls */
.controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.section-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--cr-text-primary);
  margin: 0;
}

/* War List */
.war-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.war-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  border-left: 3px solid transparent;
}

.war-win {
  border-left-color: var(--cr-victory);
}

.war-lose {
  border-left-color: var(--cr-defeat);
}

.war-na {
  border-left-color: var(--cr-neutral);
}

/* Result Badge */
.result-badge {
  width: 3rem;
  height: 3rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.75rem;
  font-size: 1.5rem;
  flex-shrink: 0;
}

.result-win {
  background: rgba(16, 185, 129, 0.2);
}

.result-lose {
  background: rgba(239, 68, 68, 0.2);
}

.result-n\/a {
  background: var(--cr-bg-tertiary);
}

/* War Details */
.war-details {
  flex: 1;
  min-width: 0;
}

.war-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
}

.opponent-name {
  font-weight: 600;
  font-size: 0.9375rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.war-date {
  font-size: 0.75rem;
  color: var(--cr-text-muted);
  flex-shrink: 0;
}

.score-comparison {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
}

.our-score {
  color: var(--cr-text-primary);
  font-weight: 600;
}

.score-separator {
  color: var(--cr-text-muted);
}

.their-score {
  color: var(--cr-text-secondary);
}

/* Result Text */
.result-text {
  flex-shrink: 0;
}

/* Skeleton */
.skeleton-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
}

.skeleton-content {
  flex: 1;
}

/* Error/Empty States */
.error-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 2rem;
  text-align: center;
}

.error-icon,
.empty-icon {
  font-size: 3rem;
}

.error-state p,
.empty-state p {
  color: var(--cr-text-secondary);
  margin: 0;
}
</style>
