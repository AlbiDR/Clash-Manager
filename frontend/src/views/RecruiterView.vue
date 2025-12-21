
<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useClanData } from '../composables/useClanData'
import { useApiState } from '../composables/useApiState'
import { useToast } from '../composables/useToast'
import { useBatchQueue } from '../composables/useBatchQueue'
import { useDeepLinkHandler } from '../composables/useDeepLinkHandler'
import { useRecruitBlacklist } from '../composables/useRecruitBlacklist'
import { useListFilter } from '../composables/useListFilter'
import { formatTimeAgo } from '../utils/formatters'
import type { Recruit } from '../types'

import Icon from '../components/Icon.vue'
import ConsoleHeader from '../components/ConsoleHeader.vue'
import RecruitCard from '../components/RecruitCard.vue'
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

const { searchQuery, sortBy, filteredItems: filteredRecruits, updateSort } = useListFilter(
    recruits,
    (r) => [r.n, r.id],
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
  const ids = filteredRecruits.value.map(r => r.id)
  setForceSelectionMode(false)
  selectAll(ids)
}

function handleSelectHighScores(threshold: number) {
  const ids = filteredRecruits.value.filter(r => (r.s || 0) >= threshold).map(r => r.id)
  setForceSelectionMode(ids.length === 0)
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
      :sort-options="sortOptions"
      @update:search="val => searchQuery = val"
      @update:sort="updateSort"
      @refresh="refresh"
    >
      <template #extra>
        <div v-if="isSelectionMode" class="selection-bar animate-pop">
           <div class="sel-count">{{ selectedIds.length }} Selected</div>
           
           <div class="sel-actions">
             <button class="action-chip" @click="handleSelectAll">All</button>
             <button class="action-chip" @click="clearSelection">None</button>
             <div class="v-divider"></div>
             <div class="score-group">
                <span class="sg-label">Score:</span>
                <button class="sg-btn" @click="handleSelectHighScores(50)">≥50</button>
                <button class="sg-btn" @click="handleSelectHighScores(75)">≥75</button>
             </div>
             <div class="v-divider"></div>
             <button class="action-chip danger" @click="clearSelection">Done</button>
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
.gpu-contain { transform: translateZ(0); will-change: transform; contain: layout paint; }
.selection-bar { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; padding-top: 8px; border-top: 1px solid var(--sys-color-outline-variant); flex-wrap: wrap; gap: 12px; }
.sel-count { font-size: 15px; font-weight: 800; color: var(--sys-color-on-surface); white-space: nowrap; }
.sel-actions { display: flex; gap: 8px; align-items: center; overflow-x: auto; padding-bottom: 2px; -webkit-overflow-scrolling: touch; }
.action-chip { background: none; border: none; font-weight: 700; cursor: pointer; padding: 6px 8px; border-radius: 8px; white-space: nowrap; font-size: 13px; color: var(--sys-color-outline); transition: all 0.2s; }
.action-chip:hover { background: var(--sys-color-surface-container-high); color: var(--sys-color-on-surface); }
.action-chip.danger { color: var(--sys-color-error); }
.action-chip.danger:hover { background: var(--sys-color-error-container); }
.v-divider { width: 1px; height: 16px; background: var(--sys-color-outline-variant); margin: 0 4px; }
.score-group { display: flex; align-items: center; gap: 2px; background: var(--sys-color-surface-container-high); padding: 2px 4px 2px 10px; border-radius: 99px; border: 1px solid transparent; }
.sg-label { font-size: 11px; font-weight: 800; color: var(--sys-color-outline); text-transform: uppercase; margin-right: 4px; }
.sg-btn { background: var(--sys-color-surface); border: 1px solid rgba(0,0,0,0.05); color: var(--sys-color-primary); font-weight: 700; font-size: 11px; padding: 4px 8px; border-radius: 12px; cursor: pointer; transition: all 0.2s var(--sys-motion-spring); }
.sg-btn:hover { transform: scale(1.05); background: var(--sys-color-primary-container); border-color: var(--sys-color-primary); }
.sg-btn:active { transform: scale(0.95); }
.animate-pop { animation: popIn 0.3s var(--sys-motion-spring); }
@keyframes popIn { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
.btn-primary { display: flex; align-items: center; gap: 8px; padding: 10px 20px; background: var(--sys-color-primary); color: var(--sys-color-on-primary); border: none; border-radius: 99px; font-weight: 700; cursor: pointer; margin-top: 16px; transition: transform 0.2s; }
.btn-primary:active { transform: scale(0.95); }
</style>
