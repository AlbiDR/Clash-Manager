<script setup lang="ts">
import { computed, watch, onUnmounted } from 'vue'
import { useClanData } from '../composables/useClanData'
import { useApiState } from '../composables/useApiState'
import { useBatchQueue } from '../composables/useBatchQueue'
import { useDeepLinkHandler } from '../composables/useDeepLinkHandler'
import { useListFilter } from '../composables/useListFilter'
import { useUiCoordinator } from '../composables/useUiCoordinator'
import { useProgressiveList } from '../composables/useProgressiveList'
import { parseTimeAgoValue, formatTimeAgo } from '../utils/formatters'
import type { LeaderboardMember } from '../types'

import ConsoleHeader from '../components/ConsoleHeader.vue'
import MemberCard from '../components/MemberCard.vue'
import SelectionBar from '../components/SelectionBar.vue'
import FabIsland from '../components/FabIsland.vue'
import EmptyState from '../components/EmptyState.vue'
import ErrorState from '../components/ErrorState.vue'
import SkeletonCard from '../components/SkeletonCard.vue'
import PullToRefresh from '../components/PullToRefresh.vue'

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
    // ... other strategies
}

const { searchQuery, sortBy, filteredItems: filteredMembers, updateSort } = useListFilter(
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

const { setFabVisible } = useUiCoordinator()
watch(() => fabState.value.visible, (visible) => setFabVisible(!!visible))
onUnmounted(() => setFabVisible(false))

const status = computed(() => {
  if (syncError.value) return { type: 'error', text: 'Retry' } as const
  if (isRefreshing.value) return { type: 'loading', text: 'Syncing...' } as const
  if (members.value.length > 0) return { type: 'ready', text: formatTimeAgo(new Date(lastSyncTime.value || Date.now()).toISOString()) } as const
  return { type: 'ready', text: 'Empty' } as const
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
  <div class="view-container">
    <PullToRefresh @refresh="refresh" />
    
    <ConsoleHeader
      title="Leaderboard"
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
    
    <ErrorState v-if="syncError && !members.length" :message="syncError" @retry="refresh" />
    
    <!-- ⚡ CRITICAL: Render skeletons if not hydrated yet. This matches the App Shell. -->
    <div v-else-if="showSkeletons" class="list-container gpu-contain">
      <SkeletonCard v-for="(n, i) in 8" :key="i" :index="i" :style="{ '--i': i }" />
    </div>
    
    <EmptyState v-else-if="!showSkeletons && filteredMembers.length === 0" icon="leaf" message="No members found" />
    
    <div v-else v-auto-animate class="list-container gpu-contain">
      <MemberCard
        v-for="(member, index) in progressiveMembers"
        :key="member.id"
        :id="`member-${member.id}`"
        :member="member"
        :expanded="expandedIds.has(member.id)"
        :selected="selectedSet.has(member.id)"
        :selection-mode="isSelectionMode"
        :style="{ '--i': index }"
        @toggle="toggleExpand(member.id)"
        @toggle-select="toggleSelect(member.id)"
      />
    </div>

    <FabIsland
      :visible="fabState.visible"
      :label="fabState.label"
      :action-href="fabState.actionHref"
      :dismiss-label="fabState.isProcessing ? 'Exit' : 'Clear'"
      :is-processing="fabState.isProcessing"
      :is-blasting="fabState.isBlasting"
      :selection-count="fabState.selectionCount"
      :blitz-enabled="fabState.blitzEnabled"
      @action="handleAction"
      @blitz="handleBlitz"
      @dismiss="clearSelection"
    />
  </div>
</template>

<style scoped>
.view-container { min-height: 100%; padding-bottom: 24px; }
.list-container { padding-bottom: 32px; position: relative; min-height: 60vh; }
.gpu-contain { transform: translateZ(0); }
</style>
