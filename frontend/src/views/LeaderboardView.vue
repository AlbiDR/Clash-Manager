<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { getLeaderboard } from '../api/gasClient'
import type { LeaderboardMember } from '../types'
import MemberCard from '../components/MemberCard.vue'

const members = ref<LeaderboardMember[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const searchQuery = ref('')
const sortBy = ref<'score' | 'trophies' | 'name'>('score')

// Expansion state
const expandedIds = ref<Set<string>>(new Set())

function toggleExpand(id: string) {
  if (expandedIds.value.has(id)) {
    expandedIds.value.delete(id)
  } else {
    expandedIds.value.add(id)
  }
  // Force reactivity
  expandedIds.value = new Set(expandedIds.value)
}

// Filtered and sorted members
const filteredMembers = computed(() => {
  let result = [...members.value]
  
  // Filter by search
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(m => 
      m.n.toLowerCase().includes(query) || 
      m.id.toLowerCase().includes(query)
    )
  }
  
  // Sort
  result.sort((a, b) => {
    switch (sortBy.value) {
      case 'score': return b.s - a.s
      case 'trophies': return b.t - a.t
      case 'name': return a.n.localeCompare(b.n)
      default: return 0
    }
  })
  
  return result
})

// Stats
const stats = computed(() => ({
  total: members.value.length,
  avgScore: Math.round(members.value.reduce((sum, m) => sum + m.s, 0) / (members.value.length || 1)),
  avgTrophies: Math.round(members.value.reduce((sum, m) => sum + m.t, 0) / (members.value.length || 1))
}))

async function loadData() {
  loading.value = true
  error.value = null
  
  try {
    const response = await getLeaderboard()
    if (response.success && response.data) {
      members.value = response.data.lb || []
    } else {
      error.value = response.error?.message || 'Failed to load data'
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Network error'
  } finally {
    loading.value = false
  }
}

onMounted(loadData)
</script>

<template>
  <div class="leaderboard-view">
    <!-- Header Stats -->
    <div class="stats-bar glass-card animate-fade-in">
      <div class="stat">
        <span class="stat-value">{{ stats.total }}</span>
        <span class="stat-label">Members</span>
      </div>
      <div class="stat">
        <span class="stat-value">{{ stats.avgScore.toLocaleString() }}</span>
        <span class="stat-label">Avg Score</span>
      </div>
      <div class="stat">
        <span class="stat-value">{{ stats.avgTrophies.toLocaleString() }}</span>
        <span class="stat-label">Avg Trophies</span>
      </div>
    </div>
    
    <!-- Controls -->
    <div class="controls animate-fade-in" style="animation-delay: 0.1s">
      <div class="search-box glass">
        <span class="search-icon">🔍</span>
        <input 
          v-model="searchQuery"
          type="text" 
          placeholder="Search members..."
          class="search-input"
        />
      </div>
      
      <div class="sort-buttons">
        <button 
          v-for="option in [
            { key: 'score', label: 'Score', icon: '⭐' },
            { key: 'trophies', label: 'Trophies', icon: '🏆' },
            { key: 'name', label: 'Name', icon: 'Aa' }
          ]"
          :key="option.key"
          class="sort-btn"
          :class="{ 'sort-btn-active': sortBy === option.key }"
          @click="sortBy = option.key as typeof sortBy"
        >
          {{ option.icon }}
        </button>
      </div>
      
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
    <div v-else-if="loading" class="member-list stagger-children">
      <div v-for="i in 8" :key="i" class="skeleton-card glass-card">
        <div class="skeleton" style="width: 48px; height: 48px; border-radius: 50%;"></div>
        <div class="skeleton-content">
          <div class="skeleton" style="width: 60%; height: 1rem; margin-bottom: 0.5rem;"></div>
          <div class="skeleton" style="width: 40%; height: 0.75rem;"></div>
        </div>
        <div class="skeleton" style="width: 60px; height: 2rem;"></div>
      </div>
    </div>
    
    <!-- Empty State -->
    <div v-else-if="filteredMembers.length === 0" class="empty-state glass-card">
      <span class="empty-icon">🔍</span>
      <p v-if="searchQuery">No members match "{{ searchQuery }}"</p>
      <p v-else>No member data available</p>
    </div>
    
    <!-- Member List -->
    <div v-else class="member-list stagger-children">
      <MemberCard 
        v-for="(member, index) in filteredMembers" 
        :key="member.id"
        :member="member"
        :rank="index + 1"
        :expanded="expandedIds.has(member.id)"
        @toggle="toggleExpand(member.id)"
      />
    </div>
  </div>
</template>

<style scoped>
.leaderboard-view {
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

.stat-label {
  font-size: 0.75rem;
  color: var(--cr-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* Controls */
.controls {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.search-box {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-radius: 0.75rem;
}

.search-icon {
  font-size: 1rem;
  opacity: 0.5;
}

.search-input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  color: var(--cr-text-primary);
  font-size: 0.875rem;
}

.search-input::placeholder {
  color: var(--cr-text-muted);
}

.sort-buttons {
  display: flex;
  gap: 0.25rem;
}

.sort-btn {
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.5rem;
  background: var(--cr-bg-tertiary);
  border: 1px solid transparent;
  color: var(--cr-text-muted);
  cursor: pointer;
  transition: all 0.2s;
  font-size: 0.875rem;
}

.sort-btn:hover {
  color: var(--cr-text-primary);
}

.sort-btn-active {
  background: rgba(99, 102, 241, 0.2);
  border-color: var(--cr-primary);
  color: var(--cr-primary-light);
}

/* Member List */
.member-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
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
