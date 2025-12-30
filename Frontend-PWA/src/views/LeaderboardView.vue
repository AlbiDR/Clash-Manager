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
    searchQuery, sortBy, visibleItems, expandedIds, selectedIds, selectedSet, fabState, isSelectionMode,
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
  { 
    label: 'Performance', 
    value: 'score', 
    desc: `**Hybrid performance metric** combining war participation, fame generation, donations, and trophies.\n\n**Components:**\n• Raw Score: Fame + Donations + (Trophies ÷ 3)\n• War Rate: Active weeks ÷ Weeks tracked\n• Inactivity Decay: -10% per week absent\n\n**Final:** Raw × (War Rate ÷ 100) × Decay Multiplier` 
  },
  { 
    label: 'Momentum', 
    value: 'trend', 
    desc: `**Weekly velocity** of performance score change.\n\n**Logic:**\nΔ Score = Current Score − Last Week's Score\n\n**Interpretation:**\n• Positive: Improving contribution\n• Negative: Declining activity\n• Zero: Stable performance` 
  },
  { 
    label: 'Trophies', 
    value: 'trophies', 
    desc: `**Current ladder ranking** (King Level Tower trophies).\n\n**Context:**\nHigher trophies generally indicate skill, but don't directly reflect clan contribution. Useful for identifying strong 1v1 players.` 
  },
  { 
    label: 'Donations', 
    value: 'donations_day', 
    desc: `**Average daily card donations** to clanmates.\n\n**Calculation:**\nTotal Lifetime Donations ÷ Days in Clan\n\n**Why it matters:**\nGenerosity metric. High donators strengthen clan economy and morale.` 
  },
  { 
    label: 'Name', 
    value: 'name', 
    desc: `**Alphabetical ordering** (A → Z) by display name.\n\n**Use case:**\nQuickly locating specific members when you know their name.` 
  }
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
    :current-sort="sortBy"
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
