<script setup lang="ts">
import { computed, watch } from 'vue'
import { useClanData } from '../composables/useClanData'
import { useApiState } from '../composables/useApiState'
import { useToast } from '../composables/useToast'
import { useBatchQueue } from '../composables/useBatchQueue'
import { useDeepLinkHandler } from '../composables/useDeepLinkHandler'
import { useRecruitBlacklist } from '../composables/useRecruitBlacklist'
import { useListFilter } from '../composables/useListFilter'
import { useProgressiveList } from '../composables/useProgressiveList'
import { formatTimeAgo } from '../utils/formatters'
import type { Recruit } from '../types'

import RecruitCard from '../components/RecruitCard.vue'
import Icon from '../components/Icon.vue'
import ConsoleLayout from '../components/ConsoleLayout.vue'

const { pingData } = useApiState()

const sheetUrl = computed(() => {
  if (!pingData.value?.spreadsheetUrl || !pingData.value?.sheets) return undefined
  const gid = pingData.value.sheets['Headhunter'] ?? pingData.value.sheets['Recruiter']
  return gid !== undefined ? `${pingData.value.spreadsheetUrl}#gid=${gid}` : pingData.value.spreadsheetUrl
})

const { data, isHydrated, isRefreshing, syncError, lastSyncTime, refresh, dismissRecruitsAction } = useClanData()
const blacklist = useRecruitBlacklist()

// 🛡️ PRE-FILTER: Exclude Tombstones
const recruits = computed(() => {
    return (data.value?.hh || []).filter(r => !blacklist.tombstones.value.has(r.id))
})

// ⚡ PERFORMANCE: Show skeletons if not hydrated or refreshing empty list
const showSkeletons = computed(() => !isHydrated.value || (isRefreshing.value && recruits.value.length === 0))

const getTs = (str?: string) => str ? new Date(str).getTime() : 0

const sortStrategies: Record<string, (a: Recruit, b: Recruit) => number> = {
    score: (a, b) => (b.s || 0) - (a.s || 0),
    trophies: (a, b) => (b.t || 0) - (a.t || 0),
    name: (a, b) => a.n.localeCompare(b.n),
    time_found: (a, b) => getTs(b.d.ago) - getTs(a.d.ago),
    donations: (a, b) => (b.d.don || 0) - (a.d.don || 0)
}

const { searchQuery, filteredItems: filteredRecruits, updateSort } = useListFilter(
    recruits,
    (r: Recruit) => [r.n, r.id],
    sortStrategies,
    'score'
)

// ⚡ PERFORMANCE: Batch size 8
const { visibleItems: progressiveRecruits } = useProgressiveList(filteredRecruits, 8)

const sortOptions = [
  { label: 'Potential', value: 'score', desc: 'AI-modeled potential score comparing recruit against clan averages.' },
  { label: 'Trophies', value: 'trophies', desc: 'Current ladder ranking.' },
  { label: 'Donations', value: 'donations', desc: 'Total lifetime donations.' },
  { label: 'Recency', value: 'time_found', desc: 'Sorts by discovery time.' },
  { label: 'Name', value: 'name', desc: 'Alphabetical.' }
]

const { 
  selectedIds, fabState, isSelectionMode, toggleSelect, selectAll, clearSelection, handleAction, handleBlitz, setForceSelectionMode
} = useBatchQueue()

const { expandedIds, toggleExpand, processDeepLink } = useDeepLinkHandler('recruit-')

const status = computed(() => {
  if (syncError.value) return { type: 'error', text: 'Retry' } as const
  if (isRefreshing.value) return { type: 'loading', text: 'Syncing...' } as const
  if (recruits.value.length > 0) return { type: 'ready', text: formatTimeAgo(new Date(lastSyncTime.value || Date.now()).toISOString()) } as const
  return { type: 'ready', text: 'Empty' as const }
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
  <ConsoleLayout
    title="Headhunter"
    :status="status"
    :show-search="!isSelectionMode"
    :sheet-url="sheetUrl"
    :stats="statsBadge"
    :sort-options="sortOptions"
    :loading="showSkeletons"
    :is-selection-mode="isSelectionMode"
    :selected-count="selectedIds.length"
    :is-refreshing="isRefreshing"
    :sync-error="syncError"
    :is-empty="!showSkeletons && filteredRecruits.length === 0"
    :fab-state="fabState"
    @refresh="refresh"
    @update:search="handleSearchUpdate"
    @update:sort="updateSort"
    @select-all="handleSelectAll"
    @clear-selection="clearSelection"
    @select-score="handleSelectScore"
    @fab-action="handleAction"
    @fab-blitz="handleBlitz"
    @fab-dismiss="dismissBulk"
  >
    <!-- Custom Empty Action for Recruit View -->
    <template #empty-action>
        <button class="btn-primary" @click="refresh">
          <Icon name="refresh" size="18" />
          <span>Scan Again</span>
        </button>
    </template>

    <!-- Default Slot: The List -->
    <RecruitCard
      v-for="(recruit, index) in progressiveRecruits"
      :key="recruit.id"
      :id="`recruit-${recruit.id}`"
      :recruit="recruit"
      :expanded="expandedIds.has(recruit.id)"
      :selected="selectedSet.has(recruit.id)"
      :selection-mode="isSelectionMode"
      :style="{ '--i': index }"
      :app-is-refreshing="isRefreshing"
      @toggle-expand="toggleExpand(recruit.id)"
      @toggle-select="toggleSelect(recruit.id)"
    />
  </ConsoleLayout>
</template>

<style scoped>
.btn-primary { display: flex; align-items: center; gap: 8px; padding: 10px 20px; background: var(--sys-color-primary); color: var(--sys-color-on-primary); border: none; border-radius: 99px; font-weight: 700; cursor: pointer; margin-top: 16px; transition: transform 0.2s; }
.btn-primary:active { transform: scale(0.95); }
</style>
