<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { getLeaderboard } from '../api/gasClient'
import type { LeaderboardMember } from '../types'
import ConsoleHeader from '../components/ConsoleHeader.vue'
import MemberCard from '../components/MemberCard.vue'
import FabIsland from '../components/FabIsland.vue'
import PullToRefresh from '../components/PullToRefresh.vue'
import EmptyState from '../components/EmptyState.vue'
import ErrorState from '../components/ErrorState.vue'

const route = useRoute()

const members = ref<LeaderboardMember[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const searchQuery = ref('')
const sortBy = ref<'score' | 'trophies' | 'name'>('score')

// Expansion & Selection
const expandedIds = ref<Set<string>>(new Set())
const selectedIds = ref<Set<string>>(new Set())
const selectionMode = ref(false)

const status = computed(() => {
  if (error.value) return { type: 'error', text: 'Error' } as const
  if (loading.value) return { type: 'loading', text: 'Syncing' } as const
  return { type: 'ready', text: `${members.value.length} Members` } as const
})

function toggleExpand(id: string) {
  if (expandedIds.value.has(id)) {
    expandedIds.value.delete(id)
  } else {
    expandedIds.value.add(id)
  }
  expandedIds.value = new Set(expandedIds.value)
}

function toggleSelect(id: string) {
  if (selectedIds.value.has(id)) {
    selectedIds.value.delete(id)
  } else {
    selectedIds.value.add(id)
    if (!selectionMode.value) selectionMode.value = true
  }
  selectedIds.value = new Set(selectedIds.value)
  
  if (selectedIds.value.size === 0) {
    selectionMode.value = false
  }
}

function selectionAllLogic(items: any[]) {
  items.forEach(i => selectedIds.value.add(i.id))
  selectedIds.value = new Set(selectedIds.value) // Force reactivity
}
function selectAll() {
  selectionAllLogic(filteredMembers.value)
}

function openSelection() {
  const ids = Array.from(selectedIds.value)
  if (ids.length === 0) return
  // Open first selected member (simplified logic for now)
  window.location.href = `clashroyale://playerInfo?id=${ids[0]}`
}

function dismissSelection() {
  selectedIds.value.clear()
  selectionMode.value = false
}

// Filtered and sorted members
const filteredMembers = computed(() => {
  let result = [...members.value]
  
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(m => 
      m.n.toLowerCase().includes(query) || 
      m.id.toLowerCase().includes(query)
    )
  }
  
  result.sort((a, b) => {
    switch (sortBy.value) {
      case 'score': return (b.s || 0) - (a.s || 0)
      case 'trophies': return (b.t || 0) - (a.t || 0)
      case 'name': return a.n.localeCompare(b.n)
      default: return 0
    }
  })
  
  return result
})

async function loadData() {
  loading.value = true
  error.value = null
  
  try {
    const response = await getLeaderboard()
    if (response.success && response.data) {
      members.value = response.data.lb || []
      
      const pinId = route.query.pin as string
      if (pinId && members.value.some(m => m.id === pinId)) {
        expandedIds.value.add(pinId)
        nextTick(() => {
          const el = document.getElementById(`member-${pinId}`)
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
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

onMounted(loadData)
</script>

<template>
  <div class="view-container">
    <PullToRefresh @refresh="loadData" />
    
    <!-- Neo-Material Console Header -->
    <ConsoleHeader
      title="Leaderboard"
      :status="status"
      :show-search="!selectionMode"
      @update:search="val => searchQuery = val"
      @update:sort="val => sortBy = val as any"
      @refresh="loadData"
    >
      <template #extra>
        <div v-if="selectionMode" class="selection-bar">
           <div class="sel-count">{{ selectedIds.size }} Selected</div>
           <div class="sel-actions">
             <span class="text-btn primary" @click="selectAll">All</span>
             <span class="text-btn" @click="selectedIds.clear()">None</span>
             <span class="text-btn danger" @click="dismissSelection">Done</span>
           </div>
        </div>
      </template>
    </ConsoleHeader>
    
    <!-- Error State -->
    <ErrorState 
      v-if="error" 
      :message="error" 
      @retry="loadData" 
    />
    
    <!-- Loading State -->
    <div v-else-if="loading" class="list-container">
      <div v-for="i in 5" :key="i" class="skeleton-card"></div>
    </div>
    
    <!-- Empty State -->
    <EmptyState 
      v-else-if="filteredMembers.length === 0"
      icon="🍃"
      message="No members found"
    />
    
    <!-- Member List -->
    <div v-else class="list-container stagger-children">
      <MemberCard
        v-for="member in filteredMembers"
        :key="member.id"
        :id="`member-${member.id}`"
        :member="member"
        :expanded="expandedIds.has(member.id)"
        :selected="selectedIds.has(member.id)"
        :selection-mode="selectionMode"
        @toggle="toggleExpand(member.id)"
        @toggle-select="toggleSelect(member.id)"
      />
    </div>

    <!-- Selection Island -->
    <FabIsland
      :visible="selectionMode"
      :label="`Open (${selectedIds.size})`"
      dismiss-label="Clear"
      @action="openSelection"
      @dismiss="dismissSelection"
    />
  </div>
</template>

<style scoped>
.view-container {
  min-height: 100%;
  padding-bottom: 24px;
}

.list-container {
  padding-bottom: 32px;
}

.selection-bar {
  display: flex; justify-content: space-between; align-items: center;
  margin-top: 12px; padding-top: 12px;
  border-top: 1px solid var(--sys-color-outline-variant);
  animation: fadeSlideIn 0.3s;
}

.sel-count { font-size: 20px; font-weight: 700; }

.text-btn {
  font-weight: 700; cursor: pointer; padding: 4px 8px;
}
.text-btn.danger { color: var(--sys-color-error); }

.skeleton-card {
  height: 100px;
  background: var(--sys-color-surface-container-high);
  border-radius: var(--shape-corner-l);
  margin-bottom: 8px;
  animation: pulse 1.5s infinite;
}
</style>
