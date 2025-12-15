<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useClanData } from '../composables/useClanData'
import { useApiState } from '../composables/useApiState'
import { useToast } from '../composables/useToast'
// New Feature Composables
import { useBatchQueue } from '../composables/useBatchQueue'
import { useDeepLinkHandler } from '../composables/useDeepLinkHandler'

import ConsoleHeader from '../components/ConsoleHeader.vue'
import RecruitCard from '../components/RecruitCard.vue'
import FabIsland from '../components/FabIsland.vue'
import PullToRefresh from '../components/PullToRefresh.vue'
import EmptyState from '../components/EmptyState.vue'
import ErrorState from '../components/ErrorState.vue'
import SkeletonCard from '../components/SkeletonCard.vue'

const { pingData } = useApiState()

// Sheet Link Computation
const sheetUrl = computed(() => {
  if (!pingData.value?.spreadsheetUrl || !pingData.value?.sheets) return undefined
  const gid = pingData.value.sheets['Headhunter'] ?? pingData.value.sheets['Recruiter']
  return gid !== undefined ? `${pingData.value.spreadsheetUrl}#gid=${gid}` : pingData.value.spreadsheetUrl
})

// Global Data
const { data, isRefreshing, syncError, lastSyncTime, refresh, dismissRecruitsAction } = useClanData()

const recruits = computed(() => data.value?.hh || [])
const loading = computed(() => !data.value && isRefreshing.value)

const searchQuery = ref('')
const sortBy = ref<'score' | 'trophies' | 'name'>('score')

// 1. Initialize Batch Queue Logic
const { 
  selectedIds, 
  fabState, 
  isSelectionMode, 
  toggleSelect, 
  selectAll, 
  clearSelection, 
  handleAction 
} = useBatchQueue()

// 2. Initialize Deep Link Logic
const { 
  expandedIds, 
  toggleExpand, 
  processDeepLink 
} = useDeepLinkHandler('recruit-')

// Helper to check selection efficiently
const selectedSet = computed(() => new Set(selectedIds.value))

// Status Pill Logic
const timeAgo = computed(() => {
  if (!lastSyncTime.value) return ''
  const ms = Date.now() - lastSyncTime.value
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  return `${hours}h ago`
})

const status = computed(() => {
  if (syncError.value) return { type: 'error', text: 'Retry' } as const
  if (isRefreshing.value) return { type: 'loading', text: 'Syncing...' } as const
  if (recruits.value.length > 0) return { type: 'ready', text: timeAgo.value || 'Ready' } as const
  return { type: 'ready', text: 'Empty' } as const
})

// Stats Badge
const statsBadge = computed(() => {
  if (!recruits.value) return undefined
  return {
    label: 'Pool',
    value: recruits.value.length.toString()
  }
})

// Filtered and sorted
const filteredRecruits = computed(() => {
  let result = [...recruits.value]
  
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(r => 
      !hiddenIds.value.has(r.id) && 
      (r.n.toLowerCase().includes(query) || r.id.toLowerCase().includes(query))
    )
  } else {
    // If no query, still filter hidden
    result = result.filter(r => !hiddenIds.value.has(r.id))
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

// Watch for data changes to handle deep links
watch(recruits, (newVal) => {
    if (newVal.length > 0) processDeepLink(newVal)
}, { immediate: true })

const { undo, success, error } = useToast()

// Separate state for temporary hiding before commit
const hiddenIds = ref<Set<string>>(new Set())

function dismissBulk() {
  if (selectedIds.value.length === 0) return
  
  const ids = [...selectedIds.value]
  
  // Clear selection UI using composable action
  clearSelection()
  
  // Execute with Undo capability
  executeDismiss(ids)
}

function executeDismiss(ids: string[]) {
    // 1. Locally hide immediately
    ids.forEach(id => hiddenIds.value.add(id))
    
    // 2. Set timer for actual commit
    const timerId = setTimeout(() => {
        dismissRecruitsAction(ids)
            .catch(() => {
                error('Failed to sync changes')
                // Revert local hide if failed
                ids.forEach(id => hiddenIds.value.delete(id))
            })
    }, 4500) // 4.5s delay
    
    // 3. Show Undo Toast
    undo(`Dismissed ${ids.length} recruits`, () => {
        clearTimeout(timerId)
        ids.forEach(id => hiddenIds.value.delete(id))
        success('Dismissal cancelled')
    })
}

function handleSelectAll() {
  const ids = filteredRecruits.value.map(r => r.id)
  selectAll(ids)
}
</script>

<template>
  <div class="view-container">
    <PullToRefresh @refresh="refresh" />
    
    <ConsoleHeader
      title="Headhunter"
      :status="status"
      :show-search="!isSelectionMode"
      :sheet-url="sheetUrl"
      :stats="statsBadge"
      @update:search="val => searchQuery = val"
      @update:sort="val => sortBy = val as any"
      @refresh="refresh"
    >
      <template #extra>
        <div v-if="isSelectionMode" class="selection-bar">
           <div class="sel-count">{{ selectedIds.length }} Selected</div>
           <div class="sel-actions">
             <span class="text-btn primary" @click="handleSelectAll">All</span>
             <span class="text-btn" @click="clearSelection">None</span>
             <span class="text-btn danger" @click="clearSelection">Done</span>
           </div>
        </div>
      </template>
    </ConsoleHeader>

    <ErrorState v-if="syncError && !recruits.length" :message="syncError" @retry="refresh" />
    
    <div v-else-if="loading && recruits.length === 0" class="list-container">
      <SkeletonCard v-for="i in 6" :key="i" />
    </div>
    
    <EmptyState 
      v-else-if="!loading && filteredRecruits.length === 0" 
      icon="telescope" 
      message="No recruits found"
      hint="Try adjusting your filters or run a new scan."
    >
      <template #action>
        <button class="btn-primary" @click="refresh">
          <Icon name="refresh" size="18" />
          <span>Scan Again</span>
        </button>
      </template>
    </EmptyState>
    
    <TransitionGroup 
      v-else 
      name="list" 
      tag="div" 
      class="list-container"
    >
      <RecruitCard
        v-for="recruit in filteredRecruits"
        :key="recruit.id"
        :id="`recruit-${recruit.id}`"
        :recruit="recruit"
        :expanded="expandedIds.has(recruit.id)"
        :selected="selectedSet.has(recruit.id)"
        :selection-mode="isSelectionMode"
        @toggle-expand="toggleExpand(recruit.id)"
        @toggle-select="toggleSelect(recruit.id)"
      />
    </TransitionGroup>

    <FabIsland
      :visible="fabState.visible"
      :label="fabState.label"
      :action-href="fabState.actionHref"
      :dismiss-label="fabState.isProcessing ? 'Exit' : 'Dismiss'"
      @action="handleAction"
      @dismiss="dismissBulk"
    />
  </div>
</template>

<style scoped>
.view-container { min-height: 100%; padding-bottom: 24px; }
.list-container { padding-bottom: 32px; }
.selection-bar {
  display: flex; justify-content: space-between; align-items: center;
  margin-top: 12px; padding-top: 12px;
  border-top: 1px solid var(--sys-color-outline-variant);
  animation: fadeSlideIn 0.3s;
}
.sel-count { font-size: 20px; font-weight: 700; }
.text-btn { font-weight: 700; cursor: pointer; padding: 4px 8px; }
.text-btn.primary { color: var(--sys-color-primary); }
.text-btn.danger { color: var(--sys-color-error); }

/* List Physics */
.list-enter-active,
.list-leave-active {
  transition: all 0.4s var(--sys-motion-spring);
}
.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: scale(0.95);
  margin-bottom: -100px; /* Collapses space */
}
.list-move {
  transition: transform 0.4s var(--sys-motion-spring);
}
.list-leave-active {
  position: absolute; width: 100%; z-index: 0;
}
.btn-primary {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 20px;
  background: var(--sys-color-primary);
  color: var(--sys-color-on-primary);
  border: none;
  border-radius: 99px;
  font-weight: 700;
  cursor: pointer;
  margin-top: 16px;
  transition: transform 0.2s;
}
.btn-primary:active { transform: scale(0.95); }
</style>
