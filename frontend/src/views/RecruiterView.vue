<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { getLeaderboard, dismissRecruits } from '../api/gasClient'
import type { Recruit } from '../types'
import RecruitCard from '../components/RecruitCard.vue'

const recruits = ref<Recruit[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const selectedIds = ref<Set<string>>(new Set())
const dismissing = ref(false)

// Sort by score descending
const sortedRecruits = computed(() => {
  return [...recruits.value].sort((a, b) => b.s - a.s)
})

// Stats
const stats = computed(() => ({
  total: recruits.value.length,
  selected: selectedIds.value.size,
  avgScore: Math.round(recruits.value.reduce((sum, r) => sum + r.s, 0) / (recruits.value.length || 1))
}))

async function loadData() {
  loading.value = true
  error.value = null
  
  try {
    const response = await getLeaderboard()
    if (response.success && response.data) {
      recruits.value = response.data.hh || []
    } else {
      error.value = response.error?.message || 'Failed to load data'
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Network error'
  } finally {
    loading.value = false
  }
}

function toggleSelect(id: string) {
  if (selectedIds.value.has(id)) {
    selectedIds.value.delete(id)
  } else {
    selectedIds.value.add(id)
  }
  // Trigger reactivity
  selectedIds.value = new Set(selectedIds.value)
}

function selectAll() {
  if (selectedIds.value.size === recruits.value.length) {
    selectedIds.value = new Set()
  } else {
    selectedIds.value = new Set(recruits.value.map(r => r.id))
  }
}

async function dismissSelected() {
  if (selectedIds.value.size === 0) return
  
  dismissing.value = true
  try {
    const ids = Array.from(selectedIds.value)
    const response = await dismissRecruits(ids)
    
    if (response.status === 'success') {
      // Remove dismissed recruits from list
      recruits.value = recruits.value.filter(r => !selectedIds.value.has(r.id))
      selectedIds.value = new Set()
    } else {
      error.value = response.error?.message || 'Failed to dismiss recruits'
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Network error'
  } finally {
    dismissing.value = false
  }
}

onMounted(loadData)
</script>

<template>
  <div class="recruiter-view">
    <!-- Header Stats -->
    <div class="stats-bar glass-card animate-fade-in">
      <div class="stat">
        <span class="stat-value">{{ stats.total }}</span>
        <span class="stat-label">Prospects</span>
      </div>
      <div class="stat">
        <span class="stat-value">{{ stats.avgScore.toLocaleString() }}</span>
        <span class="stat-label">Avg Score</span>
      </div>
      <div class="stat" v-if="stats.selected > 0">
        <span class="stat-value stat-selected">{{ stats.selected }}</span>
        <span class="stat-label">Selected</span>
      </div>
    </div>
    
    <!-- Action Bar -->
    <div class="action-bar animate-fade-in" style="animation-delay: 0.1s" v-if="!loading && recruits.length > 0">
      <button class="btn btn-secondary" @click="selectAll">
        {{ selectedIds.size === recruits.length ? '✖️ Deselect All' : '☑️ Select All' }}
      </button>
      
      <button 
        class="btn btn-primary" 
        :disabled="selectedIds.size === 0 || dismissing"
        @click="dismissSelected"
      >
        {{ dismissing ? 'Dismissing...' : `🚫 Dismiss (${selectedIds.size})` }}
      </button>
      
      <button class="btn btn-secondary" @click="loadData" :disabled="loading">
        🔄
      </button>
    </div>
    
    <!-- Error State -->
    <div v-if="error" class="error-state glass-card">
      <span class="error-icon">⚠️</span>
      <p>{{ error }}</p>
      <button class="btn btn-primary" @click="loadData">Retry</button>
    </div>
    
    <!-- Loading State -->
    <div v-else-if="loading" class="recruit-grid">
      <div v-for="i in 6" :key="i" class="skeleton-card glass-card">
        <div class="skeleton" style="width: 100%; height: 3rem; margin-bottom: 0.75rem;"></div>
        <div class="skeleton" style="width: 60%; height: 1rem; margin-bottom: 0.5rem;"></div>
        <div class="skeleton" style="width: 40%; height: 0.75rem;"></div>
      </div>
    </div>
    
    <!-- Empty State -->
    <div v-else-if="sortedRecruits.length === 0" class="empty-state glass-card">
      <span class="empty-icon">🔭</span>
      <p>No recruits found</p>
      <p class="empty-hint">Run the scout in your spreadsheet to find new prospects</p>
    </div>
    
    <!-- Recruit Grid -->
    <div v-else class="recruit-grid stagger-children">
      <RecruitCard 
        v-for="recruit in sortedRecruits" 
        :key="recruit.id"
        :recruit="recruit"
        :selected="selectedIds.has(recruit.id)"
        @toggle="toggleSelect(recruit.id)"
      />
    </div>
  </div>
</template>

<style scoped>
.recruiter-view {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* Stats Bar */
.stats-bar {
  display: flex;
  justify-content: space-around;
  padding: 1rem;
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 700;
  background: var(--cr-gradient-primary);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.stat-selected {
  background: var(--cr-gradient-gold);
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

/* Action Bar */
.action-bar {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

/* Recruit Grid */
.recruit-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 0.75rem;
}

/* Skeleton */
.skeleton-card {
  padding: 1rem;
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

.empty-hint {
  font-size: 0.875rem;
  color: var(--cr-text-muted);
}
</style>
