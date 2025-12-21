
<script setup lang="ts">
import { computed, watch } from 'vue'
import { useClanData } from '../composables/useClanData'
import { useApiState } from '../composables/useApiState'
import { useBatchQueue } from '../composables/useBatchQueue'
import { useDeepLinkHandler } from '../composables/useDeepLinkHandler'
import { useListFilter } from '../composables/useListFilter'
import { parseTimeAgoValue, formatTimeAgo } from '../utils/formatters'
import type { LeaderboardMember } from '../types'

import ConsoleHeader from '../components/ConsoleHeader.vue'
import MemberCard from '../components/MemberCard.vue'
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

const { data, isRefreshing, syncError, lastSyncTime, refresh } = useClanData()
const members = computed(() => data.value?.lb || [])
const loading = computed(() => !data.value && isRefreshing.value)

// --- SORTING STRATEGIES ---
const parseRate = (val: any) => parseFloat(String(val || '0').replace('%', '')) || 0

const sortStrategies: Record<string, (a: LeaderboardMember, b: LeaderboardMember) => number> = {
    score: (a, b) => (b.s || 0) - (a.s || 0),
    trend: (a, b) => (b.dt || 0) - (a.dt || 0),
    trophies: (a, b) => (b.t || 0) - (a.t || 0),
    name: (a, b) => a.n.localeCompare(b.n),
    donations_day: (a, b) => (b.d.avg || 0) - (a.d.avg || 0),
    war_rate: (a, b) => parseRate(b.d.rate) - parseRate(a.d.rate),
    tenure: (a, b) => (b.d.days || 0) - (a.d.days || 0),
    last_seen: (a, b) => parseTimeAgoValue(a.d.seen) - parseTimeAgoValue(b.d.seen)
}

const { searchQuery, sortBy, filteredItems: filteredMembers, updateSort } = useListFilter(
    members,
    (m) => [m.n, m.id], // Search fields
    sortStrategies,
    'score'
)

const sortOptions = [
  { label: 'Performance', value: 'score', desc: 'Proprietary metric measuring total clan contribution.' },
  { label: 'Momentum', value: 'trend', desc: 'Velocity of performance score compared to previous snapshot.' },
  { label: 'War Participation', value: 'war_rate', desc: 'Consistency rating based on active war weeks vs. tenure.' },
  { label: 'Daily Donations', value: 'donations_day', desc: 'Average cards donated per day over tenure.' },
  { label: 'Trophies', value: 'trophies', desc: 'Current ladder trophy count.' },
  { label: 'Tenure', value: 'tenure', desc: 'Days tracked by the database.' },
  { label: 'Last Active', value: 'last_seen', desc: 'Time since last game login.' },
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

const { expandedIds, toggleExpand, processDeepLink } = useDeepLinkHandler('member-')

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
  const ids = filteredMembers.value.map(i => i.id)
  setForceSelectionMode(false)
  selectAll(ids)
}

function handleSelectHighScores(threshold: number) {
  const ids = filteredMembers.value.filter(m => (m.s || 0) >= threshold).map(m => m.id)
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
    
    <ErrorState v-if="syncError && !members.length" :message="syncError" @retry="refresh" />
    
    <div v-else-if="loading && members.length === 0" class="list-container gpu-contain">
      <SkeletonCard v-for="(n, i) in 6" :key="i" :index="i" :style="{ '--i': i }" />
    </div>
    
    <EmptyState v-else-if="!loading && filteredMembers.length === 0" icon="leaf" message="No members found" />
    
    <TransitionGroup v-else name="list" tag="div" class="list-container gpu-contain">
      <MemberCard
        v-for="(member, index) in filteredMembers"
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
    </TransitionGroup>

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
.list-container { padding-bottom: 32px; position: relative; }
.gpu-contain { transform: translateZ(0); }
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
</style>
