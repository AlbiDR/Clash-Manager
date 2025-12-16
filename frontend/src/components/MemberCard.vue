<script setup lang="ts">
import { computed } from 'vue'
import type { LeaderboardMember } from '../types'
import Icon from './Icon.vue'
import WarHistoryChart from './WarHistoryChart.vue'

const props = defineProps<{
  id: string
  member: LeaderboardMember
  rank?: number
  expanded: boolean
  selected: boolean
  selectionMode: boolean
}>()

const emit = defineEmits<{
  'toggle': []
  'toggle-select': []
}>()

const toneClass = computed(() => {
  const score = props.member.s || 0
  if (score >= 80) return 'tone-high'
  if (score >= 50) return 'tone-mid'
  return 'tone-low'
})

const roleDisplay = computed(() => {
  const role = (props.member.d.role || '').toLowerCase()
  if (['leader', 'co-leader', 'coleader', 'elder'].includes(role)) {
    if (role === 'coleader' || role === 'co-leader') return 'Co-Leader'
    return role.charAt(0).toUpperCase() + role.slice(1)
  }
  return null
})

const displayRate = computed(() => {
  const val = props.member.d.rate
  if (!val) return '0%'
  if (String(val).includes('%')) return val
  const n = parseFloat(String(val))
  if (!isNaN(n) && n <= 1) return Math.round(n * 100) + '%'
  return val
})

// Composables
import { useLongPress } from '../composables/useLongPress'
import { useShare } from '../composables/useShare'

const { isLongPress, start: startPress, cancel: cancelPress } = useLongPress(() => {
  if (navigator.vibrate) navigator.vibrate(50)
  emit('toggle-select')
})

const { canShare, share } = useShare()

function shareMember() {
  share({
    title: `Clash Manager: ${props.member.n}`,
    text: `Check out ${props.member.n} (${props.member.d.role}) in our clan!`,
    url: `https://royaleapi.com/player/${props.member.id}`
  })
}

function handleClick(e: Event) {
  if (isLongPress.value) {
    isLongPress.value = false
    return
  }
  // Prevent toggle if clicking a button/link
  if ((e.target as HTMLElement).closest('.btn-action') || (e.target as HTMLElement).closest('a')) return
  
  if ((e.target as HTMLElement).closest('.chevron-btn')) {
    emit('toggle')
    return
  }

  if (props.selectionMode) {
    emit('toggle-select')
  } else {
    emit('toggle')
  }
}
</script>

<template>
  <div 
    class="card"
    :class="{ 'expanded': expanded, 'selected': selected }"
    @click="handleClick"
    @mousedown="startPress"
    @touchstart="startPress"
    @mouseup="cancelPress"
    @touchend="cancelPress"
    @touchmove="cancelPress"
    @mouseleave="cancelPress"
    @contextmenu.prevent
  >
    <div class="selection-indicator"></div>

    <!-- Header -->
    <div class="card-header">
      <div class="info-stack">
        <div class="name-row">
          <span class="player-name">{{ member.n }}</span>
          <span v-if="roleDisplay" class="role-badge">{{ roleDisplay }}</span>
        </div>
        <div class="meta-row">
          <span class="meta-val">{{ member.d.days }}d</span>
          <span class="dot-separator">•</span>
          <span class="meta-val trophy-val">
            {{ (member.t || 0).toLocaleString() }} 
            <Icon name="trophy" size="10" style="margin-left:2px; color:#fbbf24;" />
          </span>
        </div>
      </div>

      <div class="action-area">
        <div class="stat-pod" :class="toneClass">
          <div class="stat-score">{{ Math.round(member.s || 0) }}</div>
        </div>
        <div class="chevron-btn">
          <Icon name="chevron_down" size="18" />
        </div>
      </div>
    </div>

    <!-- Body (Expanded) -->
    <div class="card-body">
      
      <!-- Stats Row (Clean) -->
      <div class="stats-row">
        <div class="stat-cell">
          <span class="sc-label">Avg/Day</span>
          <span class="sc-val">{{ member.d.avg }}</span>
        </div>
        <div class="stat-cell border-l">
          <span class="sc-label">War Rate</span>
          <span class="sc-val">{{ displayRate }}</span>
        </div>
        <div class="stat-cell border-l">
          <span class="sc-label">Last Seen</span>
          <span class="sc-val">{{ member.d.seen }}</span>
        </div>
      </div>

      <!-- Sparkline -->
      <WarHistoryChart v-if="member.d.hist" :history="member.d.hist" />

      <!-- Action Toolbar -->
      <div class="actions-toolbar">
        <a 
          :href="`clashroyale://playerInfo?id=${member.id}`" 
          class="btn-action primary compact"
        >
          <Icon name="crown" size="14" />
          <span>Open Game</span>
        </a>
        <a 
          :href="`https://royaleapi.com/player/${member.id}`" 
          target="_blank"
          class="btn-action secondary compact"
        >
          <span>RoyaleAPI</span>
        </a>
        <button v-if="canShare" class="btn-icon-action" @click.stop="shareMember">
          <Icon name="share" size="16" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 🃏 Card Base */
.card {
  background: var(--sys-color-surface-container);
  border-radius: 16px; /* Slightly tighter radius */
  padding: 10px 12px;
  margin-bottom: 6px;
  position: relative; overflow: hidden;
  transition: background 0.2s, box-shadow 0.2s;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  border: 1px solid rgba(255,255,255,0.03);
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}

.card:active { 
  background: var(--sys-color-surface-container-high); 
}

.card.expanded { 
  background: var(--sys-color-surface-container-high);
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  border-color: rgba(var(--sys-color-primary-rgb), 0.3);
  z-index: 10;
  margin: 12px 0;
}

.card.selected { 
  background: var(--sys-color-secondary-container); 
}
.card.selected .player-name { color: var(--sys-color-on-secondary-container); }
.card.selected .meta-val { color: var(--sys-color-on-secondary-container); opacity: 0.8; }

.selection-indicator {
  position: absolute; left: 0; top: 0; bottom: 0; width: 4px;
  background: var(--sys-color-primary); opacity: 0; transition: opacity 0.2s;
}
.card.selected .selection-indicator { opacity: 1; }

/* HEADER */
.card-header { 
  display: flex; justify-content: space-between; align-items: center;
}

.info-stack { display: flex; flex-direction: column; gap: 2px; }

.name-row { display: flex; align-items: center; gap: 6px; }
.player-name { 
  font-size: 15px; font-weight: 750; color: var(--sys-color-on-surface); 
  letter-spacing: -0.01em;
}

.meta-row { display: flex; align-items: center; gap: 6px; }
.meta-val { font-size: 12px; font-weight: 500; color: var(--sys-color-outline); }
.dot-separator { font-size: 10px; color: var(--sys-color-outline); opacity: 0.5; }
.trophy-val { display: flex; align-items: center; }

.action-area { display: flex; align-items: center; gap: 10px; }

/* COMPACT STAT POD */
.stat-pod {
  display: flex; align-items: center; justify-content: center;
  width: 36px; height: 36px;
  border-radius: 10px;
  background: var(--sys-color-surface-container-highest);
  color: var(--sys-color-on-surface-variant);
  font-weight: 800; font-size: 14px;
  font-family: var(--sys-font-family-mono);
}
.stat-pod.tone-high { background: var(--sys-color-primary); color: var(--sys-color-on-primary); }
.stat-pod.tone-mid { background: var(--sys-color-secondary-container); color: var(--sys-color-on-secondary-container); }

.chevron-btn { color: var(--sys-color-outline); transition: transform 0.3s; }
.card.expanded .chevron-btn { transform: rotate(180deg); color: var(--sys-color-primary); }

/* BODY (SLIM) */
.card-body {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  transition: grid-template-rows 0.3s var(--sys-motion-spring), opacity 0.3s ease;
  overflow: hidden;
}
.card-body > * { min-height: 0; }

.card.expanded .card-body {
  grid-template-rows: 1fr;
  opacity: 1;
  padding-top: 12px;
  border-top: 1px solid rgba(0,0,0,0.05);
  margin-top: 10px;
}

/* STATS ROW (DIVIDED) */
.stats-row {
  display: flex; justify-content: space-between;
  padding: 0 4px;
  margin-bottom: 4px;
}
.stat-cell {
  flex: 1; display: flex; flex-direction: column; align-items: center;
}
.stat-cell.border-l { border-left: 1px solid rgba(255,255,255,0.05); }

.sc-label { font-size: 10px; text-transform: uppercase; color: var(--sys-color-outline); font-weight: 700; margin-bottom: 2px; }
.sc-val { font-size: 14px; font-weight: 700; color: var(--sys-color-on-surface); font-family: var(--sys-font-family-mono); }

/* ACTION TOOLBAR */
.actions-toolbar {
  display: flex; gap: 8px; margin-top: 8px;
}

.btn-action {
  flex: 1;
  display: flex; align-items: center; justify-content: center; gap: 6px;
  height: 32px; /* Slim Height */
  border-radius: 8px;
  font-size: 12px; font-weight: 600; text-decoration: none;
  transition: opacity 0.2s;
}
.btn-action.primary { background: var(--sys-color-primary); color: white; }
.btn-action.secondary { background: var(--sys-color-surface-container); color: var(--sys-color-on-surface); border: 1px solid rgba(255,255,255,0.05); }
.btn-action:active { opacity: 0.7; }

.btn-icon-action {
  width: 32px; height: 32px;
  display: flex; align-items: center; justify-content: center;
  background: transparent; border: 1px solid rgba(255,255,255,0.1);
  color: var(--sys-color-primary); border-radius: 8px;
  cursor: pointer;
}
</style>
