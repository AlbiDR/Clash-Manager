<script setup lang="ts">
import { computed, watch } from 'vue'
import { useClanData } from '../composables/useClanData'
import { useApiState } from '../composables/useApiState'
import { useBatchQueue } from '../composables/useBatchQueue'
import { useDeepLinkHandler } from '../composables/useDeepLinkHandler'
import { useListFilter } from '../composables/useListFilter'
import { useProgressiveList } from '../composables/useProgressiveList'
import { formatTimeAgo } from '../utils/formatters'
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
const members = computed(() => data.value?.lb || [])

// ⚡ PERFORMANCE: Show skeletons if we haven't loaded local data yet OR if we are refreshing an empty list
const showSkeletons = computed(() => !isHydrated.value || (isRefreshing.value && members.value.length === 0))

const sortStrategies: Record<string, (a: LeaderboardMember, b: LeaderboardMember) => number> = {
    score: (a, b) => (b.s || 0) - (a.s || 0),
    trend: (a, b) => (b.dt || 0) - (a.dt || 0),
    trophies: (a, b) => (b.t || 0) - (a.t || 0),
    name: (a, b) => a.n.localeCompare(b.n),
    donations_day: (a, b) => (b.d.avg || 0) - (a.d.avg || 0),
}

const { searchQuery, filteredItems: filteredMembers, updateSort } = useListFilter(
    members,
    (m: LeaderboardMember) => [m.n, m.id], 
    sortStrategies,
    'score'
)

// ⚡ PERFORMANCE: Initial Batch = 8 (Fits 100% of mobile viewport)
const { visibleItems: progressiveMembers } = useProgressiveList(filteredMembers, 8)

const sortOptions = [
  { label: 'Performance', value: 'score', desc: 'Proprietary metric measuring total clan contribution.' },
  { label: 'Momentum', value: 'trend', desc: 'Velocity of performance score compared to previous snapshot.' },
  { label: 'Trophies', value: 'trophies', desc: 'Current ladder trophy count.' },
  { label: 'Donations', value: 'donations_day', desc: 'Average daily donations.' },
  { label: 'Name', value: 'name', desc: 'Alphabetical.' }
]

const { 
  selectedIds, fabState, isSelectionMode, toggleSelect, selectAll, clearSelection, handleAction, handleBlitz, setForceSelectionMode
} = useBatchQueue()

const { expandedIds, toggleExpand, processDeepLink } = useDeepLinkHandler('member-')

const status = computed(() => {
  if (syncError.value) return { type: 'error', text: 'Retry' } as const
  if (isRefreshing.value) return { type: 'loading', text: 'Syncing...' } as const
  if (members.value.length > 0) return { type: 'ready', text: formatTimeAgo(new Date(lastSyncTime.value || Date.now()).toISOString()) } as const
  return { type: 'ready', text: 'Empty' as const }
})

const statsBadge = computed(() => ({
    label: 'Clan',
    value: members.value.length.toString()
}))

const selectedSet = computed(() => new Set(selectedIds.value))

function handleSelectAll() {
  const ids = filteredMembers.value.map((i: LeaderboardMember) => i.id)
  setForceSelectionMode(false)
  selectAll(ids)
}

function handleSelectScore(threshold: number, mode: 'ge' | 'le') {
  const ids = filteredMembers.value.filter((m: LeaderboardMember) => {
    const s = m.s || 0
    return mode === 'ge' ? s >= threshold : s <= threshold
  }).map((m: LeaderboardMember) => m.id)
  setForceSelectionMode(ids.length === 0)
  selectAll(ids)
}

watch(members, (newVal) => {
    if (newVal.length > 0) processDeepLink(newVal)
}, { immediate: true })

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
    :is-empty="!showSkeletons && filteredMembers.length === 0"
    :fab-state="fabState"
    @refresh="refresh"
    @update:search="val => searchQuery = val"
    @update:sort="updateSort"
    @select-all="handleSelectAll"
    @clear-selection="clearSelection"
    @select-score="handleSelectScore"
    @fab-action="handleAction"
    @fab-blitz="handleBlitz"
    @fab-dismiss="clearSelection"
  >
    <!-- Default Slot: The List -->
    <MemberCard
      v-for="(member, index) in progressiveMembers"
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
