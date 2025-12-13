<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue'
import { useRoute } from 'vue-router'
// Use global data composable instead of direct API
import { useClanData } from '../composables/useClanData'
import ConsoleHeader from '../components/ConsoleHeader.vue'
import MemberCard from '../components/MemberCard.vue'
import FabIsland from '../components/FabIsland.vue'
import PullToRefresh from '../components/PullToRefresh.vue'
import EmptyState from '../components/EmptyState.vue'
import ErrorState from '../components/ErrorState.vue'

const route = useRoute()

// Global Data
const { data, isRefreshing, syncError, lastSyncTime, refresh } = useClanData()

// Derived Members List from Global Data
const members = computed(() => data.value?.lb || [])

// Loading state roughly correlates with no data being present
const loading = computed(() => !data.value && isRefreshing.value)

const searchQuery = ref('')
const sortBy = ref<'score' | 'trophies' | 'name'>('score')

// Expansion & Selection
const expandedIds = ref<Set<string>>(new Set())
const selectedIds = ref<Set<string>>(new Set())
const selectionQueue = ref<string[]>([])
const selectionMode = ref(false)

// Computed for FAB
const fabState = computed(() => {
  if (!selectionMode.value) return { visible: false }
  
  if (selectionQueue.value.length > 0) {
    const total = selectedIds.value.size
    const current = total - selectionQueue.value.length + 1
    const nextId = selectionQueue.value[0]
    return {
      visible: true,
      label: `Next (${current}/${total})`,
      actionHref: `clashroyale://playerInfo?id=${nextId}`,
      dismissLabel: 'Exit',
      isQueue: true
    }
  } else {
    const ids = Array.from(selectedIds.value)
    const firstId = ids.length > 0 ? ids[0] : null
    
    return {
      visible: ids.length > 0,
      label: `Open (${ids.length})`,
      actionHref: firstId ? `clashroyale://playerInfo?id=${firstId}` : undefined,
      dismissLabel: 'Clear',
      isQueue: false
    }
  }
})

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

function toggleExpand(id: string) {
  if (expandedIds.value.has(id)) {
    expandedIds.value.delete(id)
  } else {
    expandedIds.value.add(id)
  }
  expandedIds.value = new Set(expandedIds.value)
}

function toggleSelect(id: string) {
  if (selectionQueue.value.length > 0) return
  if (selectedIds.value.has(id)) {
    selectedIds.value.delete(id)
  } else {
    selectedIds.value.add(id)
    if (!selectionMode.value) selectionMode.value = true
  }
  selectedIds.value = new Set(selectedIds.value)
  if (selectedIds.value.size === 0) selectionMode.value = false
}

function selectAll() {
  filteredMembers.value.forEach(i => selectedIds.value.add(i.id))
  selectedIds.value = new Set(selectedIds.value)
}

function selectionAction() {
  if (selectionQueue.value.length === 0) selectionQueue.value = Array.from(selectedIds.value)
  setTimeout(() => {
    selectionQueue.value.shift()
    if (selectionQueue.value.length === 0) {
      selectionMode.value = false
      selectedIds.value.clear()
    }
  }, 100)
}

function dismissSelection() {
  selectedIds.value.clear()
  selectionMode.value = false
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
      default: return 0
    }
  })
  return result
})

function handleDeepLinks() {
  const pinId = route.query.pin as string
  if (pinId && members.value.some(m => m.id === pinId)) {
    expandedIds.value.add(pinId)
    nextTick(() => {
      const el = document.getElementById(`member-${pinId}`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }
}

// Watch for data changes to handle deep links
watch(members, (newVal) => {
    if (newVal.length > 0) handleDeepLinks()
}, { immediate: true })

</script>

<template>
  <div class="view-container">
    <PullToRefresh @refresh="refresh" />
    
    <ConsoleHeader
      title="Leaderboard"
      :status="status"
      :show-search="!selectionMode"
      @update:search="val => searchQuery = val"
      @update:sort="val => sortBy = val as any"
      @refresh="refresh"
    >
      <template #extra>
        <div v-if="selectionMode" class="selection-bar">
           <div class="sel-count">{{ selectedIds.size }} Selected</div>
           <div class="sel-actions">
             <span class="text-btn primary" @click="selectAll">All</span>
             <span class="text-btn" @click="selectedIds.clear()">None</span>
             <span class="text-btn danger" @click="dismissSelection">Done</span>
           </div>
        </div>
      </template>
    </ConsoleHeader>
    
    <ErrorState v-if="syncError && !members.length" :message="syncError" @retry="refresh" />
    
    <!-- Only show Skeleton if completely empty and loading -->
    <div v-else-if="loading && members.length === 0" class="list-container">
      <div v-for="i in 5" :key="i" class="skeleton-card"></div>
    </div>
    
    <EmptyState 
      v-else-if="!loading && filteredMembers.length === 0"
      icon="🍃"
      message="No members found"
    />
    
    <div v-else class="list-container stagger-children">
      <MemberCard
        v-for="member in filteredMembers"
        :key="member.id"
        :id="`member-${member.id}`"
        :member="member"
        :expanded="expandedIds.has(member.id)"
        :selected="selectedIds.has(member.id)"
        :selection-mode="selectionMode"
        @toggle="toggleExpand(member.id)"
        @toggle-select="toggleSelect(member.id)"
      />
    </div>

    <FabIsland
      :visible="fabState.visible"
      :label="fabState.label"
      :action-href="fabState.actionHref"
      :dismiss-label="fabState.dismissLabel"
      @action="selectionAction"
      @dismiss="dismissSelection"
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
.text-btn.danger { color: var(--sys-color-error); }
.skeleton-card {
  height: 100px;
  background: var(--sys-color-surface-container-high);
  border-radius: var(--shape-corner-l);
  margin-bottom: 8px;
  animation: pulse 1.5s infinite;
}
</style>
