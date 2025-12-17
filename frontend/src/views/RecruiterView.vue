<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useClanData } from '../composables/useClanData'
import { useApiState } from '../composables/useApiState'
import { useToast } from '../composables/useToast'
import { useBatchQueue } from '../composables/useBatchQueue'
import { useDeepLinkHandler } from '../composables/useDeepLinkHandler'

import Icon from '../components/Icon.vue'
import ConsoleHeader from '../components/ConsoleHeader.vue'
import RecruitCard from '../components/RecruitCard.vue'
import FabIsland from '../components/FabIsland.vue'
import EmptyState from '../components/EmptyState.vue'
import ErrorState from '../components/ErrorState.vue'
import SkeletonCard from '../components/SkeletonCard.vue'

const { pingData } = useApiState()

const sheetUrl = computed(() => {
  if (!pingData.value?.spreadsheetUrl || !pingData.value?.sheets) return undefined
  const gid = pingData.value.sheets['Headhunter'] ?? pingData.value.sheets['Recruiter']
  return gid !== undefined ? `${pingData.value.spreadsheetUrl}#gid=${gid}` : pingData.value.spreadsheetUrl
})

const { data, isRefreshing, syncError, lastSyncTime, refresh, dismissRecruitsAction } = useClanData()

const recruits = computed(() => data.value?.hh || [])
const loading = computed(() => !data.value && isRefreshing.value)

const searchQuery = ref('')
const sortBy = ref<'score' | 'trophies' | 'name' | 'time_found' | 'donations' | 'war_wins' | 'cards_won'>('score')

const sortOptions = [
  { label: 'Potential', value: 'score' },
  { label: 'War Wins', value: 'war_wins' },
  { label: 'Cards Won', value: 'cards_won' },
  { label: 'Donations', value: 'donations' },
  { label: 'Trophies', value: 'trophies' },
  { label: 'Recency', value: 'time_found' },
  { label: 'Name', value: 'name' }
]

const { 
  selectedIds, 
  fabState, 
  isSelectionMode, 
  toggleSelect, 
  selectAll, 
  clearSelection, 
  handleAction,
  handleBlitz
} = useBatchQueue()

const { 
  expandedIds, 
  toggleExpand, 
  processDeepLink 
} = useDeepLinkHandler('recruit-')

const selectedSet = computed(() => new Set(selectedIds.value))

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

const statsBadge = computed(() => {
  if (!recruits.value) return undefined
  return {
    label: 'Pool',
    value: recruits.value.length.toString()
  }
})

const getTs = (str?: string) => str ? new Date(str).getTime() : 0

const filteredRecruits = computed(() => {
  let result = [...recruits.value]
  
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(r => 
      !hiddenIds.value.has(r.id) && 
      (r.n.toLowerCase().includes(query) || r.id.toLowerCase().includes(query))
    )
  } else {
    result = result.filter(r => !hiddenIds.value.has(r.id))
  }
  
  result.sort((a, b) => {
    switch (sortBy.value) {
      case 'score': return (b.s || 0) - (a.s || 0)
      case 'trophies': return (b.t || 0) - (a.t || 0)
      case 'name': return a.n.localeCompare(b.n)
      case 'time_found': return getTs(b.d.ago) - getTs(a.d.ago)
      case 'war_wins': return (b.d.war || 0) - (a.d.war || 0)
      case 'donations': return (b.d.don || 0) - (a.d.don || 0)
      case 'cards_won': return (b.d.cards || 0) - (a.d.cards || 0)
      default: return 0
    }
  })
  return result
})

watch(recruits, (newVal) => {
    if (newVal.length > 0) processDeepLink(newVal)
}, { immediate: true })

const { undo, success, error } = useToast()
const hiddenIds = ref<Set<string>>(new Set())

function dismissBulk() {
  if (selectedIds.value.length === 0) return
  const ids = [...selectedIds.value]
  clearSelection()
  executeDismiss(ids)
}

function executeDismiss(ids: string[]) {
    ids.forEach(id => hiddenIds.value.add(id))
    const timerId = setTimeout(() => {
        dismissRecruitsAction(ids)
            .catch(() => {
                error('Failed to sync changes')
                ids.forEach(id => hiddenIds.value.delete(id))
            })
    }, 4500)
    
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

function handleSortUpdate(val: string) {
  if (document.startViewTransition) {
    document.startViewTransition(() => {
      sortBy.value = val as any
    })
  } else {
    sortBy.value = val as any
  }
}
</script>

<template>
  <div class="view-container">
    <ConsoleHeader
      title="Headhunter"
      :status="status"
      :show-search="!isSelectionMode"
      :sheet-url="sheetUrl"
      :stats="statsBadge"
      :sort-options="sortOptions"
      @update:search="val => searchQuery = val"
      @update:sort="handleSortUpdate"
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
    
    <div v-else-if="loading && recruits.length === 0" class="list-container gpu-contain">
      <SkeletonCard v-for="(n, i) in 6" :key="i" :index="i" :style="{ '--i': i }" />
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
      class="list-container gpu-contain"
    >
      <RecruitCard
        v-for="(recruit, index) in filteredRecruits"
        :key="recruit.id"
        :id="`recruit-${recruit.id}`"
        :recruit="recruit"
        :expanded="expandedIds.has(recruit.id)"
        :selected="selectedSet.has(recruit.id)"
        :selection-mode="isSelectionMode"
        :style="{ '--i': index }"
        @toggle-expand="toggleExpand(recruit.id)"
        @toggle-select="toggleSelect(recruit.id)"
      />
    </TransitionGroup>

    <FabIsland
      :visible="fabState.visible"
      :label="fabState.label"
      :action-href="fabState.actionHref"
      :dismiss-label="fabState.isProcessing ? 'Exit' : 'Dismiss'"
      :is-processing="fabState.isProcessing"
      :is-blasting="fabState.isBlasting"
      :selection-count="fabState.selectionCount"
      :blitz-enabled="fabState.blitzEnabled"
      @action="handleAction"
      @blitz="handleBlitz"
      @dismiss="dismissBulk"
    />
  </div>
</template>

<style scoped>
.view-container { min-height: 100%; padding-bottom: 24px; }
.list-container { padding-bottom: 32px; position: relative; }

.gpu-contain {
  transform: translateZ(0);
  will-change: transform;
  contain: layout paint;
}

.selection-bar {
  display: flex; justify-content: space-between; align-items: center;
  margin-top: 12px; padding-top: 12px;
  border-top: 1px solid var(--sys-color-outline-variant);
}
.sel-count { font-size: 20px; font-weight: 700; }
.text-btn { font-weight: 700; cursor: pointer; padding: 4px 8px; }
.text-btn.primary { color: var(--sys-color-primary); }
.text-btn.danger { color: var(--sys-color-error); }

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
