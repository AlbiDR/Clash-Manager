<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useClanData } from '../composables/useClanData'
import { useApiState } from '../composables/useApiState'
import { useBatchQueue } from '../composables/useBatchQueue'
import { useDeepLinkHandler } from '../composables/useDeepLinkHandler'

import ConsoleHeader from '../components/ConsoleHeader.vue'
import MemberCard from '../components/MemberCard.vue'
import FabIsland from '../components/FabIsland.vue'
import EmptyState from '../components/EmptyState.vue'
import ErrorState from '../components/ErrorState.vue'
import SkeletonCard from '../components/SkeletonCard.vue'

const { pingData } = useApiState()

const sheetUrl = computed(() => {
  if (!pingData.value?.spreadsheetUrl || !pingData.value?.sheets) return undefined
  const gid = pingData.value.sheets['Leaderboard']
  return gid !== undefined ? `${pingData.value.spreadsheetUrl}#gid=${gid}` : pingData.value.spreadsheetUrl
})

const { data, isRefreshing, syncError, lastSyncTime, refresh } = useClanData()
const members = computed(() => data.value?.lb || [])
const loading = computed(() => !data.value && isRefreshing.value)

const searchQuery = ref('')
const sortBy = ref<'score' | 'trophies' | 'name' | 'donations_day' | 'war_rate' | 'tenure' | 'last_seen' | 'trend'>('score')

const sortOptions = [
  { label: 'Performance', value: 'score' },
  { label: 'Momentum', value: 'trend' },
  { label: 'War Participation', value: 'war_rate' },
  { label: 'Daily Donations', value: 'donations_day' },
  { label: 'Trophies', value: 'trophies' },
  { label: 'Tenure', value: 'tenure' },
  { label: 'Last Active', value: 'last_seen' },
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
} = useDeepLinkHandler('member-')

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
  if (members.value.length > 0) return { type: 'ready', text: timeAgo.value || 'Ready' } as const
  return { type: 'ready', text: 'Empty' } as const
})

const statsBadge = computed(() => {
  if (!members.value) return undefined
  return {
    label: 'Clan',
    value: members.value.length.toString()
  }
})

const selectedSet = computed(() => new Set(selectedIds.value))

function handleSelectAll() {
  const ids = filteredMembers.value.map(i => i.id)
  selectAll(ids)
}

function handleSearchUpdate(val: string) {
  searchQuery.value = val
}

function handleSortUpdate(val: string) {
  if (sortOptions.some(opt => opt.value === val)) {
    if (document.startViewTransition) {
        document.startViewTransition(() => {
            sortBy.value = val as typeof sortBy.value
        })
    } else {
        sortBy.value = val as typeof sortBy.value
    }
  }
}

function parseTimeAgo(val: string | null | undefined): number {
  if (!val || val === '-' || val === 'Just now') return 0
  const match = val.match(/^(\d+)([ymdh]) ago$/)
  if (!match) return 99999999
  const num = parseInt(match[1])
  const unit = match[2]
  switch(unit) {
    case 'm': return num
    case 'h': return num * 60
    case 'd': return num * 1440
    case 'y': return num * 525600
    default: return num
  }
}

function parseRate(val: string | number | null | undefined): number {
  if (!val) return 0
  const s = String(val)
  return parseFloat(s.replace('%', '')) || 0
}

const filteredMembers = computed(() => {
  let result = [...members.value]
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(m => m.n.toLowerCase().includes(query) || m.id.toLowerCase().includes(query))
  }
  
  result.sort((a, b) => {
    switch (sortBy.value) {
      case 'score': return (b.s || 0) - (a.s || 0)
      case 'trend': return (b.dt || 0) - (a.dt || 0)
      case 'trophies': return (b.t || 0) - (a.t || 0)
      case 'name': return a.n.localeCompare(b.n)
      case 'donations_day': return (b.d.avg || 0) - (a.d.avg || 0)
      case 'war_rate': return parseRate(b.d.rate) - parseRate(a.d.rate)
      case 'tenure': return (b.d.days || 0) - (a.d.days || 0)
      case 'last_seen': return parseTimeAgo(a.d.seen) - parseTimeAgo(b.d.seen)
      default: return 0
    }
  })
  return result
})

watch(members, (newVal) => {
    if (newVal.length > 0) processDeepLink(newVal)
}, { immediate: true })

</script>

<template>
  <div class="view-container">
    <ConsoleHeader
      title="Leaderboard"
      :status="status"
      :show-search="!isSelectionMode"
      :sheet-url="sheetUrl"
      :stats="statsBadge"
      :sort-options="sortOptions"
      @update:search="handleSearchUpdate"
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
    
    <ErrorState v-if="syncError && !members.length" :message="syncError" @retry="refresh" />
    
    <div v-else-if="loading && members.length === 0" class="list-container">
      <SkeletonCard v-for="(n, i) in 6" :key="i" :index="i" :style="{ '--i': i }" />
    </div>
    
    <EmptyState 
      v-else-if="!loading && filteredMembers.length === 0"
      icon="leaf"
      message="No members found"
    />
    
    <TransitionGroup 
      v-else 
      name="list" 
      tag="div" 
      class="list-container"
    >
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
.list-container { padding-bottom: 32px; position: relative; perspective: 1000px; transform-style: preserve-3d; }
.selection-bar {
  display: flex; justify-content: space-between; align-items: center;
  margin-top: 12px; padding-top: 12px;
  border-top: 1px solid var(--sys-color-outline-variant);
}
.sel-count { font-size: 20px; font-weight: 700; }
.text-btn { font-weight: 700; cursor: pointer; padding: 4px 8px; }
.text-btn.primary { color: var(--sys-color-primary); }
.text-btn.danger { color: var(--sys-color-error); }
</style>
