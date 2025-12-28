<script setup lang="ts">
import { computed } from 'vue'
import { useClanData } from '../composables/useClanData'
import { useApiState } from '../composables/useApiState'
import { useConsoleLogic } from '../composables/useConsoleLogic'
import type { LeaderboardMember } from '../types'

import MemberCard from '../components/MemberCard.vue'
import ConsoleLayout from '../components/ConsoleLayout.vue'

const { pingData } = useApiState()

const sheetUrl = computed(() => {
  if (!pingData.value?.spreadsheetUrl || !pingData.value?.sheets) return undefined
  const gid = pingData.value.sheets['Leaderboard']
  return gid !== undefined ? `${pingData.value.spreadsheetUrl}#gid=${gid}` : pingData.value.spreadsheetUrl
})

const { data, isHydrated, isRefreshing, syncError, lastSyncTime, refresh } = useClanData()
// Ensure we pass a Ref<LeaderboardMember[]>
const members = computed(() => data.value?.lb || [])

const sortStrategies: Record<string, (a: LeaderboardMember, b: LeaderboardMember) => number> = {
    score: (a, b) => (b.s || 0) - (a.s || 0),
    trend: (a, b) => (b.dt || 0) - (a.dt || 0),
    trophies: (a, b) => (b.t || 0) - (a.t || 0),
    name: (a, b) => a.n.localeCompare(b.n),
    donations_day: (a, b) => (b.d.avg || 0) - (a.d.avg || 0),
}

const {
    searchQuery, visibleItems, expandedIds, selectedIds, selectedSet, fabState, isSelectionMode,
    status, statsBadge, showSkeletons, filteredItems,
    updateSort, toggleSelect, toggleExpand, clearSelection, handleAction, handleBlitz, handleSelectAll, handleSelectScore
} = useConsoleLogic({
    data: members,
    isHydrated,
    isRefreshing,
    syncError,
    lastSyncTime,
    filterFn: (m: LeaderboardMember) => [m.n, m.id],
    sortStrategies,
    defaultSort: 'score',
    deepLinkPrefix: 'member-',
    batchIdMapper: (m: LeaderboardMember) => m.id,
    statsLabel: 'Clan'
})

const sortOptions = [
  { label: 'Performance', value: 'score', desc: 'Proprietary metric measuring total clan contribution.' },
  { label: 'Momentum', value: 'trend', desc: 'Velocity of performance score compared to previous snapshot.' },
  { label: 'Trophies', value: 'trophies', desc: 'Current ladder trophy count.' },
  { label: 'Donations', value: 'donations_day', desc: 'Average daily donations.' },
  { label: 'Name', value: 'name', desc: 'Alphabetical.' }
]

// Specific Helper for Score Selection
function onSelectScore(threshold: number, mode: 'ge' | 'le') {
    handleSelectScore(threshold, mode, (m) => m.s || 0)
}
</script>

<template>
  <ConsoleLayout
    title="Leaderboard"
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
    :is-empty="!showSkeletons && filteredItems.length === 0"
    :fab-state="fabState"
    @refresh="refresh"
    @update:search="val => searchQuery = val"
    @update:sort="updateSort"
    @select-all="handleSelectAll"
    @clear-selection="clearSelection"
    @select-score="onSelectScore"
    @fab-action="handleAction"
    @fab-blitz="handleBlitz"
    @fab-dismiss="clearSelection"
  >
    <!-- Default Slot: The List -->
    <MemberCard
      v-for="(member, index) in visibleItems"
      :key="member.id"
      :id="`member-${member.id}`"
      :member="member"
      :expanded="expandedIds.has(member.id)"
      :selected="selectedSet.has(member.id)"
      :selection-mode="isSelectionMode"
      :style="{ '--i': index }"
      :app-is-refreshing="isRefreshing"
      @toggle="toggleExpand(member.id)"
      @toggle-select="toggleSelect(member.id)"
    />
  </ConsoleLayout>
</template>
