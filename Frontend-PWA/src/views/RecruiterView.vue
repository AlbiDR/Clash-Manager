<script setup lang="ts">
import { computed, watch } from 'vue'
import { useClanData } from '../composables/useClanData'
import { useApiState } from '../composables/useApiState'
import { useToast } from '../composables/useToast'
import { useRecruitBlacklist } from '../composables/useRecruitBlacklist'
import { useConsoleLogic } from '../composables/useConsoleLogic'
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

const getTs = (str?: string) => str ? new Date(str).getTime() : 0

const sortStrategies: Record<string, (a: Recruit, b: Recruit) => number> = {
    score: (a, b) => (b.s || 0) - (a.s || 0),
    trophies: (a, b) => (b.t || 0) - (a.t || 0),
    name: (a, b) => a.n.localeCompare(b.n),
    time_found: (a, b) => getTs(b.d.ago) - getTs(a.d.ago),
    donations: (a, b) => (b.d.don || 0) - (a.d.don || 0)
}

const {
    searchQuery, sortBy, visibleItems, expandedIds, selectedIds, selectedSet, fabState, isSelectionMode,
    status, statsBadge, showSkeletons, filteredItems,
    updateSort, toggleSelect, toggleExpand, clearSelection, handleAction, handleBlitz, handleSelectAll, handleSelectScore, processDeepLink
} = useConsoleLogic({
    data: recruits,
    isHydrated,
    isRefreshing,
    syncError,
    lastSyncTime,
    filterFn: (r: Recruit) => [r.n, r.id],
    sortStrategies,
    defaultSort: 'score',
    deepLinkPrefix: 'recruit-',
    batchIdMapper: (r: Recruit) => r.id,
    statsLabel: 'Pool'
})

const sortOptions = [
  { 
    label: 'Potential', 
    value: 'score', 
    desc: `**Predictive quality score** based on Fame potential and account progression.\n\n**Algorithm:**\nCompares the recruit's Trophies, King Tower Level, and Lifetime Donations against your clan's median.\n\n**Signal:**\nRecruits with high potential are more likely to win Duels and earn maximum Medals in the River Race.` 
  },
  { 
    label: 'Trophies', 
    value: 'trophies', 
    desc: `**Current rank** on Trophy Road or Path of Legends.\n\n**Why prioritize:**\nHigher trophies often mean a more developed card pool and better understanding of the current Meta.` 
  },
  { 
    label: 'Donations', 
    value: 'donations', 
    desc: `**Lifetime card donations** from previous clan history.\n\n**Insight:**\n• **High**: Dedicated team player. Reliable for Clan Chat activity.\n• **Low**: Potentially a solo-focused player or a fresh King Tower level.\n\n**Note:** Past generosity is the best predictor of future Clan support.` 
  },
  { 
    label: 'Recency', 
    value: 'time_found', 
    desc: `**Discovery timestamp** from the latest tournament scan.\n\n**Use case:**\nIdentifying 'Fresh Talent'. New recruits are often looking for a home immediately after leaving their previous clan.` 
  },
  { 
    label: 'Name', 
    value: 'name', 
    desc: `**Alphabetical ordering** by display name.\n\n**Use case:**\nTracking specific players across multiple Headhunter scans.` 
  }
]

// 🧹 CLEANUP: Extra Recruit Logic managed here
watch(() => data.value?.hh, (newRecruits) => {
    if (newRecruits && newRecruits.length > 0) {
        const currentIds = newRecruits.map(r => r.id)
        blacklist.prune(currentIds)
        // Note: processDeepLink is auto-called by useConsoleLogic watcher on data change, 
        // but here we might need manual control if blacklist affects it? 
        // Actually useConsoleLogic watches 'recruits' computed, which filters blacklist.
        // So we don't need to manually call processDeepLink here!
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

// Specific Helper for Score Selection
function onSelectScore(threshold: number, mode: 'ge' | 'le') {
    handleSelectScore(threshold, mode, (r) => r.s || 0)
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
    :current-sort="sortBy"
    :loading="showSkeletons"
    :is-selection-mode="isSelectionMode"
    :selected-count="selectedIds.length"
    :is-refreshing="isRefreshing"
    :sync-error="syncError"
    :is-empty="!showSkeletons && filteredItems.length === 0"
    :fab-state="fabState"
    @refresh="refresh"
    @update:search="handleSearchUpdate"
    @update:sort="updateSort"
    @select-all="handleSelectAll"
    @clear-selection="clearSelection"
    @select-score="onSelectScore"
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
      v-for="(recruit, index) in visibleItems"
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
