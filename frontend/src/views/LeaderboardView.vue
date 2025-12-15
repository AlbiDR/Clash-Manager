<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useClanData } from '../composables/useClanData'
import { useApiState } from '../composables/useApiState'
import { useBatchQueue } from '../composables/useBatchQueue'
import { useDeepLinkHandler } from '../composables/useDeepLinkHandler'

import ConsoleHeader from '../components/ConsoleHeader.vue'
import MemberCard from '../components/MemberCard.vue'
import FabIsland from '../components/FabIsland.vue'
import PullToRefresh from '../components/PullToRefresh.vue'
import EmptyState from '../components/EmptyState.vue'
import ErrorState from '../components/ErrorState.vue'
import SkeletonCard from '../components/SkeletonCard.vue'

const { pingData } = useApiState()

// Sheet Link Computation
const sheetUrl = computed(() => {
  if (!pingData.value?.spreadsheetUrl || !pingData.value?.sheets) return undefined
  const gid = pingData.value.sheets['Leaderboard']
  return gid !== undefined ? `${pingData.value.spreadsheetUrl}#gid=${gid}` : pingData.value.spreadsheetUrl
})

// Global Data
const { data, isRefreshing, syncError, lastSyncTime, refresh } = useClanData()
const members = computed(() => data.value?.lb || [])
const loading = computed(() => !data.value && isRefreshing.value)

const searchQuery = ref('')
// Extended sorting keys
const sortBy = ref<'score' | 'trophies' | 'name' | 'donations_day' | 'war_rate' | 'tenure' | 'last_seen'>('score')

// Sort Options Definition
const sortOptions = [
  { label: 'Score', value: 'score' },
  { label: 'Donations / Day', value: 'donations_day' },
  { label: 'War Rate', value: 'war_rate' },
  { label: 'Tenure', value: 'tenure' },
  { label: 'Last Seen', value: 'last_seen' },
  { label: 'Trophies', value: 'trophies' },
  { label: 'Name', value: 'name' }
]

// 1. Initialize Batch Queue Logic
const { 
  selectedIds, 
  fabState, 
  isSelectionMode, 
  toggleSelect, 
  selectAll, 
  clearSelection, 
  handleAction 
} = useBatchQueue()

// 2. Initialize Deep Link Logic
const { 
  expandedIds, 
  toggleExpand, 
  processDeepLink 
} = useDeepLinkHandler('member-')

// Status Pill Logic
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

// Stats Badge
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

// ------------------------------------------------------------------
// SORT HELPERS
// ------------------------------------------------------------------

// Workaround: Use 'any' type to silence strict null checks in build
function parseTimeAgo(str: any): number {
  if (!str || typeof str !== 'string' || str === '-' || str === 'Just now') return 0
  
  const match = str.match(/^(\d+)([ymdh]) ago$/)
  if (!match) return 99999999 // Unknown/Oldest
  
  const val = parseInt(match[1])
  const unit = match[2]
  
  switch(unit) {
    case 'm': return val
    case 'h': return val * 60
    case 'd': return val * 1440
    case 'y': return val * 525600
    default: return val
  }
}

function parseRate(str: any): number {
  if (!str || typeof str !== 'string') return 0
  return parseFloat(str.replace('%', '')) || 0
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
      case 'trophies': return (b.t || 0) - (a.t || 0)
      case 'name': return a.n.localeCompare(b.n)
      
      case 'donations_day': return (b.d.avg || 0) - (a.d.avg || 0)
      
      case 'war_rate': 
        // @ts-ignore - Force cast to avoid strict null check build error
        return parseRate(b.d.rate as any) - parseRate(a.d.rate as any)
      
      case 'tenure': return (b.d.days || 0) - (a.d.days || 0)
      
      case 'last_seen': 
        // Smaller "minutes ago" means more recent.
        // @ts-ignore - Force cast to avoid strict null check build error
        return parseTimeAgo(a.d.seen as any) - parseTimeAgo(b.d.seen as any)
        
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
    <PullToRefresh @refresh="refresh" />
    
    <ConsoleHeader
      title="Leaderboard"
      :status="status"
      :show-search="!isSelectionMode"
      :sheet-url="sheetUrl"
      :stats="statsBadge"
      :sort-options="sortOptions"
      @update:search="val => searchQuery = val"
      @update:sort="val => sortBy = val as any"
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
      <SkeletonCard v-for="i in 6" :key="i" />
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
        v-for="member in filteredMembers"
        :key="member.id"
        :id="`member-${member.id}`"
        :member="member"
        :expanded="expandedIds.has(member.id)"
        :selected="selectedSet.has(member.id)"
        :selection-mode="isSelectionMode"
        @toggle="toggleExpand(member.id)"
        @toggle-select="toggleSelect(member.id)"
      />
    </TransitionGroup>

    <FabIsland
      :visible="fabState.visible"
      :label="fabState.label"
      :action-href="fabState.actionHref"
      :dismiss-label="fabState.isProcessing ? 'Exit' : 'Clear'"
      @action="handleAction"
      @dismiss="clearSelection"
    />
  </div>
</template>

<style scoped>
.view-container { min-height: 100%; padding-bottom: 24px; }
.list-container { padding-bottom: 32px; }
.selection-bar {
  display: flex; justify-content: space-between; align-items: center;
  margin-top: 12px; padding-top: 12px;
  border-top: 1px solid var(--sys-color-outline-variant);
  animation: fadeSlideIn 0.3s;
}
.sel-count { font-size: 20px; font-weight: 700; }
.text-btn { font-weight: 700; cursor: pointer; padding: 4px 8px; }
.text-btn.primary { color: var(--sys-color-primary); }
.text-btn.danger { color: var(--sys-color-error); }

/* List Physics */
.list-enter-active,
.list-leave-active {
  transition: all 0.4s var(--sys-motion-spring);
}
.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: scale(0.95);
  margin-bottom: -100px;
}
.list-move {
  transition: transform 0.4s var(--sys-motion-spring);
}
</style>
