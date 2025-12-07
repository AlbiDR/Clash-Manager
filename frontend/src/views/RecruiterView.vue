<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { getLeaderboard, dismissRecruits } from '../api/gasClient'
import type { Recruit } from '../types'
import RecruitCard from '../components/RecruitCard.vue'
import PullToRefresh from '../components/PullToRefresh.vue'
import EmptyState from '../components/EmptyState.vue'
import ErrorState from '../components/ErrorState.vue'

const route = useRoute()

const recruits = ref<Recruit[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const selectedIds = ref<Set<string>>(new Set())
const expandedIds = ref<Set<string>>(new Set())
const dismissing = ref(false)
const selectionMode = ref(false)

let longPressTimer: ReturnType<typeof setTimeout> | null = null

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
      
      // Handle Pin/Scroll-to
      const pinId = route.query.pin as string
      if (pinId && recruits.value.some(r => r.id === pinId)) {
        expandedIds.value.add(pinId)
        nextTick(() => {
          const el = document.getElementById(`recruit-${pinId}`)
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' })
            el.classList.add('flash-highlight')
          }
        })
      }
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
    // Auto-enter selection mode if not active
    if (!selectionMode.value) selectionMode.value = true
  }
  selectedIds.value = new Set(selectedIds.value) // Trigger reactivity
  
  // Exit selection mode if nothing selected
  if (selectedIds.value.size === 0) {
    selectionMode.value = false
  }
}

function toggleExpand(id: string) {
  if (expandedIds.value.has(id)) {
    expandedIds.value.delete(id)
  } else {
    expandedIds.value.add(id)
  }
  expandedIds.value = new Set(expandedIds.value)
}

function handleLongPress(id: string) {
  longPressTimer = setTimeout(() => {
    if (navigator.vibrate) navigator.vibrate(50)
    selectionMode.value = true
    selectedIds.value.add(id)
    selectedIds.value = new Set(selectedIds.value)
  }, 500)
}

function cancelLongPress() {
  if (longPressTimer) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }
}

function selectAll() {
  if (selectedIds.value.size === recruits.value.length) {
    selectedIds.value = new Set()
    selectionMode.value = false
  } else {
    selectedIds.value = new Set(recruits.value.map(r => r.id))
  }
}

function exitSelectionMode() {
  selectionMode.value = false
  selectedIds.value = new Set()
}

async function dismissSelected() {
  if (selectedIds.value.size === 0) return
  
  if (!confirm(`Dismiss ${selectedIds.value.size} recruits?`)) return
  
  dismissing.value = true
  try {
    const ids = Array.from(selectedIds.value)
    const response = await dismissRecruits(ids)
    
    if (response.status === 'success') {
      recruits.value = recruits.value.filter(r => !selectedIds.value.has(r.id))
      selectedIds.value = new Set()
      selectionMode.value = false
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
    <PullToRefresh @refresh="loadData" :disabled="selectionMode" />

    <!-- Selection Mode Header -->
    <div v-if="selectionMode" class="selection-header">
      <div class="selection-info">
        <span class="selection-count">{{ selectedIds.size }} Selected</span>
      </div>
      <div class="selection-actions">
        <button class="action-link" @click="selectAll">
          {{ selectedIds.size === recruits.length ? 'None' : 'All' }}
        </button>
        <button class="action-link action-cancel" @click="exitSelectionMode">
          Done
        </button>
      </div>
    </div>
    
    <!-- Normal Stats Header -->
    <div v-else class="stats-bar">
      <div class="stat">
        <span class="stat-value">{{ stats.total }}</span>
        <span class="stat-label">Prospects</span>
      </div>
      <div class="stat">
        <span class="stat-value">{{ stats.avgScore.toLocaleString() }}</span>
        <span class="stat-label">Avg Score</span>
      </div>
      <div class="header-actions">
        <button 
          class="action-btn"
          @click="selectionMode = true"
          v-tooltip="'Select Multiple'"
        >
          ✅
        </button>
        <button 
          class="refresh-btn" 
          @click="loadData" 
          :disabled="loading"
          v-tooltip="'Refresh'"
        >
          {{ loading ? '...' : '🔄' }}
        </button>
      </div>
    </div>
    
    <!-- Error State -->
    <!-- Error State -->
    <ErrorState 
      v-if="error" 
      :message="error" 
      @retry="loadData" 
    />
    
    <!-- Loading State -->
    <div v-else-if="loading" class="recruit-list">
      <div v-for="i in 6" :key="i" class="skeleton-card">
        <div class="skeleton" style="width: 100%; height: 4rem;"></div>
      </div>
    </div>
    
    <!-- Empty State -->
    <!-- Empty State -->
    <EmptyState 
      v-else-if="sortedRecruits.length === 0"
      message="No recruits found"
      hint="Run the scout in your spreadsheet to find new prospects"
    />
    
    <!-- Recruit List -->
    <div v-else class="recruit-list">
      <RecruitCard 
        v-for="recruit in sortedRecruits" 
        :key="recruit.id"
        :id="`recruit-${recruit.id}`"
        :recruit="recruit"
        :selected="selectedIds.has(recruit.id)"
        :expanded="expandedIds.has(recruit.id)"
        :selectionMode="selectionMode"
        @toggleSelect="toggleSelect(recruit.id)"
        @toggleExpand="toggleExpand(recruit.id)"
        @mousedown="handleLongPress(recruit.id)"
        @touchstart.passive="handleLongPress(recruit.id)"
        @mouseup="cancelLongPress"
        @mouseleave="cancelLongPress"
        @touchend="cancelLongPress"
        @touchmove="cancelLongPress"
      />
    </div>
    
    <!-- Floating Action Button (FAB) -->
    <Transition name="fab">
      <div v-if="selectionMode && selectedIds.size > 0" class="fab-island">
        <div class="fab-content">
          <button 
            class="fab-btn fab-danger" 
            @click="dismissSelected"
            :disabled="dismissing"
          >
            <span class="fab-icon">✕</span>
            <span>{{ dismissing ? 'Dismissing...' : `Dismiss (${selectedIds.size})` }}</span>
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.recruiter-view {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding-bottom: 100px; /* Space for FAB */
}

/* Selection Header */
.selection-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  background: var(--md-sys-color-surface-container-high, #e8e8e8);
  border-radius: 1rem;
}

.selection-count {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--md-sys-color-on-surface, #1c1b1f);
}

.selection-actions {
  display: flex;
  gap: 1rem;
}

.action-link {
  background: none;
  border: none;
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--md-sys-color-primary, #6750a4);
  cursor: pointer;
}

.action-cancel {
  color: var(--md-sys-color-error, #b3261e);
}

/* Stats Bar */
.stats-bar {
  display: flex;
  align-items: center;
  justify-content: space-around;
  padding: 1rem;
  background: var(--md-sys-color-surface-container, #f3f3f3);
  border-radius: 1rem;
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
  color: var(--md-sys-color-primary, #6750a4);
}

.stat-label {
  font-size: 0.75rem;
  color: var(--md-sys-color-outline, #79747e);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.refresh-btn {
  width: 3rem;
  height: 3rem;
  border: none;
  background: var(--md-sys-color-surface-variant, #e7e0ec);
  border-radius: 50%;
  font-size: 1.25rem;
  cursor: pointer;
}

.header-actions {
  display: flex;
  gap: 0.5rem;
}

.action-btn {
  width: 3rem;
  height: 3rem;
  border: none;
  background: transparent;
  color: var(--md-sys-color-primary);
  border-radius: 50%;
  font-size: 1.25rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.action-btn:hover {
  background: var(--md-sys-color-surface-container-highest);
}

/* Recruit List */
.recruit-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

/* Skeleton */
.skeleton-card {
  padding: 1rem;
  background: var(--md-sys-color-surface-container, #f3f3f3);
  border-radius: 1.25rem;
}

.skeleton {
  background: linear-gradient(90deg, #e0e0e0 25%, #f0f0f0 50%, #e0e0e0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 0.5rem;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* Error/Empty States */
.error-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 3rem 2rem;
  text-align: center;
  background: var(--md-sys-color-surface-container, #f3f3f3);
  border-radius: 1.25rem;
}

.error-icon,
.empty-icon {
  font-size: 3rem;
}

.error-state p,
.empty-state p {
  color: var(--md-sys-color-on-surface-variant, #49454f);
  margin: 0;
}

.empty-hint {
  font-size: 0.875rem;
  color: var(--md-sys-color-outline, #79747e);
}

.btn-primary {
  padding: 0.875rem 1.5rem;
  background: var(--md-sys-color-primary, #6750a4);
  color: var(--md-sys-color-on-primary, #ffffff);
  border: none;
  border-radius: 1.5rem;
  font-weight: 600;
  cursor: pointer;
}

/* Floating Action Button Island */
.fab-island {
  position: fixed;
  bottom: 100px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;
}

.fab-content {
  background: var(--md-sys-color-on-surface, #1c1b1f);
  padding: 0.5rem;
  border-radius: 2rem;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
}

.fab-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem 1.5rem;
  border: none;
  border-radius: 1.5rem;
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s ease;
}

.fab-btn:active {
  transform: scale(0.95);
}

.fab-danger {
  background: var(--md-sys-color-error, #b3261e);
  color: var(--md-sys-color-on-error, #ffffff);
}

.fab-icon {
  font-size: 1rem;
}

/* FAB Transition */
.fab-enter-active,
.fab-leave-active {
  transition: all 0.3s cubic-bezier(0.2, 0, 0, 1);
}

.fab-enter-from,
.fab-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(20px) scale(0.9);
}
</style>
