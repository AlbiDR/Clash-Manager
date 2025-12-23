<script setup lang="ts">
import { computed, watch, onUnmounted } from 'vue'
import { useClanData } from '../composables/useClanData'
import { useApiState } from '../composables/useApiState'
import { useToast } from '../composables/useToast'
import { useBatchQueue } from '../composables/useBatchQueue'
import { useDeepLinkHandler } from '../composables/useDeepLinkHandler'
import { useRecruitBlacklist } from '../composables/useRecruitBlacklist'
import { useListFilter } from '../composables/useListFilter'
import { useUiCoordinator } from '../composables/useUiCoordinator'
import { formatTimeAgo } from '../utils/formatters'
import type { Recruit } from '../types'

import Icon from '../components/Icon.vue'
import ConsoleHeader from '../components/ConsoleHeader.vue'
import RecruitCard from '../components/RecruitCard.vue'
import SelectionBar from '../components/SelectionBar.vue'
import FabIsland from '../components/FabIsland.vue'
import EmptyState from '../components/EmptyState.vue'
import ErrorState from '../components/ErrorState.vue'
import SkeletonCard from '../components/SkeletonCard.vue'
import PullToRefresh from '../components/PullToRefresh.vue'

const { pingData } = useApiState()

const sheetUrl = computed(() => {
  if (!pingData.value?.spreadsheetUrl || !pingData.value?.sheets) return undefined
  const gid = pingData.value.sheets['Headhunter'] ?? pingData.value.sheets['Recruiter']
  return gid !== undefined ? `${pingData.value.spreadsheetUrl}#gid=${gid}` : pingData.value.spreadsheetUrl
})

const { data, isRefreshing, syncError, lastSyncTime, refresh, dismissRecruitsAction } = useClanData()
const blacklist = useRecruitBlacklist()

// 🛡️ PRE-FILTER: Exclude Tombstones
const recruits = computed(() => {
    return (data.value?.hh || []).filter(r => !blacklist.tombstones.value.has(r.id))
})
const loading = computed(() => !data.value && isRefreshing.value)

const getTs = (str?: string) => str ? new Date(str).getTime() : 0

const sortStrategies: Record<string, (a: Recruit, b: Recruit) => number> = {
    score: (a, b) => (b.s || 0) - (a.s || 0),
    trophies: (a, b) => (b.t || 0) - (a.t || 0),
    name: (a, b) => a.n.localeCompare(b.n),
    time_found: (a, b) => getTs(b.d.ago) - getTs(a.d.ago),
    war_wins: (a, b) => (b.d.war || 0) - (a.d.war || 0),
    donations: (a, b) => (b.d.don || 0) - (a.d.don || 0),
    cards_won: (a, b) => (b.d.cards || 0) - (a.d.cards || 0)
}

const { searchQuery, filteredItems: filteredRecruits, updateSort } = useListFilter(
    recruits,
    (r: Recruit) => [r.n, r.id],
    sortStrategies,
    'score'
)

const sortOptions = [
  { label: 'Potential', value: 'score', desc: 'AI-modeled potential score comparing recruit against clan averages.' },
  { label: 'War Wins', value: 'war_wins', desc: 'Lifetime War Day wins. Includes heuristic bonus for active racers.' },
  { label: 'Cards Won', value: 'cards_won', desc: 'Total cards won in challenges.' },
  { label: 'Donations', value: 'donations', desc: 'Total lifetime donations.' },
  { label: 'Trophies', value: 'trophies', desc: 'Current ladder ranking.' },
  { label: 'Recency', value: 'time_found', desc: 'Sorts by discovery time.' },
  { label: 'Name', value: 'name', desc: 'Alphabetical.' }
]

const { 
  selectedIds, 
  fabState, 
  isSelectionMode, 
  toggleSelect, 
  selectAll, 
  clearSelection, 
  handleAction, 
  handleBlitz,
  setForceSelectionMode
} = useBatchQueue()

const { expandedIds, toggleExpand, processDeepLink } = useDeepLinkHandler('recruit-')

const { setFabVisible } = useUiCoordinator()
watch(() => fabState.value.visible, (visible) => {
    setFabVisible(!!visible)
})

onUnmounted(() => {
    setFabVisible(false)
})

const status = computed(() => {
  if (syncError.value) return { type: 'error', text: 'Retry' } as const
  if (isRefreshing.value) return { type: 'loading', text: 'Syncing...' } as const
  if (recruits.value.length > 0) return { type: 'ready', text: formatTimeAgo(new Date(lastSyncTime.value || Date.now()).toISOString()) } as const
  return { type: 'ready', text: 'Empty' } as const
})

const statsBadge = computed(() => ({
    label: 'Pool',
    value: recruits.value.length.toString()
}))

const selectedSet = computed(() => new Set(selectedIds.value))

// 🧹 CLEANUP
watch(() => data.value?.hh, (newRecruits) => {
    if (newRecruits && newRecruits.length > 0) {
        const currentIds = newRecruits.map(r => r.id)
        blacklist.prune(currentIds)
        processDeepLink(newRecruits)
    }
}, { deep: true, immediate: true })

const { undo, success, error } = useToast()

function dismissBulk() {
  if (selectedIds.value.length === 0) return
  const ids = [...selectedIds.value]
  clearSelection()
  executeDismiss(ids)
}

function executeDismiss(ids: string[]) {
    blacklist.hide(ids)
    
    const timerId = setTimeout(() => {
        dismissRecruitsAction(ids)
            .catch(() => {
                error('Failed to sync changes')
                blacklist.restore(ids)
            })
    }, 4500)
    
    undo(`Dismissed ${ids.length} recruits`, () => {
        clearTimeout(timerId)
        blacklist.restore(ids)
        success('Dismissal cancelled')
    })
}

function handleSelectAll() {
  const ids = filteredRecruits.value.map((r: Recruit) => r.id)
  setForceSelectionMode(false)
  selectAll(ids)
}

function handleSelectScore(threshold: number, mode: 'ge' | 'le') {
  const ids = filteredRecruits.value.filter((r: Recruit) => {
    const s = r.s || 0
    return mode === 'ge' ? s >= threshold : s <= threshold
  }).map((r: Recruit) => r.id)
  setForceSelectionMode(ids.length === 0)
  selectAll(ids)
}

function handleSearchUpdate(val: string) {
  searchQuery.value = val
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
      :sort-options="sortOptions"
      @update:search="handleSearchUpdate"
      @update:sort="updateSort"
      @refresh="refresh"
    >
      <template #extra>
        <SelectionBar 
            v-if="isSelectionMode"
            :count="selectedIds.length"
            @select-all="handleSelectAll"
            @clear="clearSelection"
            @done="clearSelection"
            @select-score="handleSelectScore"
        />
      </template>
    </ConsoleHeader>

    <ErrorState v-if="syncError && !recruits.length" :message="syncError" @retry="refresh" />
    
    <div v-else-if="loading && recruits.length === 0" class="list-container gpu-contain">
      <SkeletonCard v-for="(_, i) in 6" :key="i" :index="i" :style="{ '--i': i }" />
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
    
    <div 
      v-else 
      v-auto-animate
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
    </div>

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
/* Min-height prevents layout shift when loading or filtering */
.list-container { padding-bottom: 32px; position: relative; min-height: 60vh; }
.gpu-contain { transform: translateZ(0); will-change: transform; contain: layout paint; }
.btn-primary { display: flex; align-items: center; gap: 8px; padding: 10px 20px; background: var(--sys-color-primary); color: var(--sys-color-on-primary); border: none; border-radius: 99px; font-weight: 700; cursor: pointer; margin-top: 16px; transition: transform 0.2s; }
.btn-primary:active { transform: scale(0.95); }
</style>
