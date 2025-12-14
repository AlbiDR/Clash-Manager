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

// Tonal Palette Logic
const toneClass = computed(() => {
  const score = props.member.s || 0
  if (score >= 80) return 'tone-high'
  if (score >= 50) return 'tone-mid'
  return 'tone-low'
})

// Role Badge Logic
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
  
  if ((e.target as HTMLElement).closest('.btn-action') || (e.target as HTMLElement).closest('a')) return
  
  if ((e.target as HTMLElement).closest('.chevron-btn')) {
    // Chevron always toggles expansion, even in selection mode
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
          <span>{{ member.d.days }} days</span>
          <span class="dot-separator">•</span>
          <span class="trophy-val">
            {{ (member.t || 0).toLocaleString() }} 
            <Icon name="trophy" size="14" style="margin-left:2px; color:#fbbf24;" />
          </span>
        </div>
      </div>

      <div class="action-area">
        <div class="stat-pod" :class="toneClass">
          <div class="stat-score">{{ Math.round(member.s || 0) }}</div>
          <div class="stat-sub">SCORE</div>
        </div>
        <div class="chevron-btn">
          <Icon name="chevron_down" size="20" />
        </div>
      </div>
    </div>

    <!-- Body (Expanded) -->
    <div class="card-body">
      <div class="grid-stats">
        <div class="stat-item">
          <div class="si-label">Avg/Day</div>
          <div class="si-val">{{ member.d.avg }}</div>
        </div>
        <div class="stat-item">
          <div class="si-label">War Rate</div>
          <div class="si-val">{{ displayRate }}</div>
        </div>
        <div class="stat-item">
          <div class="si-label">Last Seen</div>
          <div class="si-val">{{ member.d.seen }}</div>
        </div>
      </div>

      <!-- War History Viz -->
      <WarHistoryChart v-if="member.d.hist" :history="member.d.hist" class="mb-4" />

      <!-- Action Grid -->
      <div class="row-actions">
        <a 
          :href="`https://royaleapi.com/player/${member.id}`" 
          target="_blank"
          class="btn-action secondary"
        >
          RoyaleAPI
        </a>
        <a 
          :href="`clashroyale://playerInfo?id=${member.id}`" 
          class="btn-action primary"
        >
          Clash Royale
        </a>
        <button v-if="canShare" class="btn-icon-action secondary" @click.stop="shareMember">
          <Icon name="share" size="20" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 🃏 Neo-Card Styles */
.card {
  background: var(--sys-color-surface-container); /* Updated to standard container */
  border-radius: var(--shape-corner-l);
  padding: var(--spacing-l) var(--spacing-m); /* 24px 16px */
  margin-bottom: var(--spacing-xs);
  border: 1px solid transparent;
  position: relative; overflow: hidden;
  transition: all 0.3s var(--sys-motion-spring);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  
  /* Internal Grid Layout */
  display: grid;
  gap: var(--spacing-m);
}

.card:active { 
  transform: scale(0.98); 
  background: var(--sys-color-surface-container-high); 
}

.card.expanded { 
  box-shadow: var(--sys-elevation-3); 
  background: var(--sys-color-surface-container-high);
  z-index: 10; margin: var(--spacing-m) 0;
  border-color: var(--sys-surface-glass-border);
}

.card.selected { 
  background: var(--sys-color-secondary-container); 
}
.card.selected .player-name { color: var(--sys-color-on-secondary-container); }
.card.selected .meta-row { color: var(--sys-color-on-secondary-container); opacity: 0.8; }

.selection-indicator {
  position: absolute; left: 0; top: 0; bottom: 0; width: 6px;
  background: var(--sys-color-primary); opacity: 0; transition: opacity 0.2s;
}
.card.selected .selection-indicator { opacity: 1; }

/* HEADER GRID */
.card-header { 
  display: grid; 
  grid-template-columns: 1fr auto;
  gap: var(--spacing-s);
  align-items: center; 
}

.info-stack { 
  display: flex; flex-direction: column; 
  gap: 2px; /* Tight leading */
  min-width: 0; 
}

.name-row { display: flex; align-items: center; gap: var(--spacing-xs); flex-wrap: wrap;}

.player-name { 
  font-family: var(--sys-font-family-body);
  font-size: var(--font-size-l); 
  font-weight: var(--font-weight-bold); 
  color: var(--sys-color-on-surface); 
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; 
  letter-spacing: -0.02em; 
}

.meta-row { 
  display: flex; align-items: center; 
  gap: var(--spacing-xs); 
  font-size: var(--font-size-s); 
  color: var(--sys-color-outline); 
  font-weight: var(--font-weight-medium); 
}

.action-area { display: flex; align-items: center; gap: var(--spacing-s); }

.chevron-btn {
  display: flex; align-items: center; justify-content: center;
  width: 32px; height: 32px;
  color: var(--sys-color-on-surface-variant);
  background: rgba(0,0,0,0.05);
  border-radius: 50%;
  transition: transform 0.4s var(--sys-motion-bouncy), background-color 0.2s;
}
.card.expanded .chevron-btn { transform: rotate(180deg); background: rgba(0,0,0,0.1); }


/* STAT POD */
.stat-pod {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  width: 56px; height: 56px; /* Slightly tighter */
  border-radius: var(--shape-corner-m);
  background: var(--sys-color-surface-container-highest);
  color: var(--sys-color-on-surface-variant);
  flex-shrink: 0;
  transition: background 0.3s;
}
.stat-pod.tone-high { background: var(--sys-color-primary-container); color: var(--sys-color-on-primary-container); }
.stat-pod.tone-mid { background: var(--sys-color-secondary-container); color: var(--sys-color-on-secondary-container); }
.stat-pod.tone-low { background: var(--sys-color-surface-variant); color: var(--sys-color-on-surface-variant); }

.stat-score { 
  font-size: var(--font-size-l); 
  font-weight: var(--font-weight-heavy); 
  line-height: 1; 
  letter-spacing: -0.5px; 
  font-family: var(--sys-font-family-mono); 
}
.stat-sub { 
  font-size: 9px; 
  font-weight: var(--font-weight-bold); 
  opacity: 0.8; 
  margin-top: 2px; 
  text-transform: uppercase; 
  letter-spacing: 0.5px; 
}

/* EXPANDED BODY */
.card-body {
  max-height: 0; opacity: 0; overflow: hidden;
  transition: all 0.4s var(--sys-motion-spring);
  border-top: 1px solid transparent;
  margin-top: 0; padding-top: 0;
}
.card.expanded .card-body {
  max-height: 500px; opacity: 1;
  margin-top: var(--spacing-s); /* Visual gap */
  padding-top: var(--spacing-m);
  border-top-color: var(--sys-color-outline-variant);
  border-top-width: 1px;
}

.grid-stats { 
  display: grid; 
  grid-template-columns: repeat(3, 1fr); 
  gap: var(--spacing-xs); 
  margin-bottom: var(--spacing-m); 
}

.stat-item { 
  background: var(--sys-color-surface-container-highest); /* High contrast inside container */
  padding: var(--spacing-s) var(--spacing-xs); 
  border-radius: var(--shape-corner-m); 
  text-align: center; 
}
.si-label { 
  font-size: 10px; 
  font-weight: var(--font-weight-bold); 
  text-transform: uppercase; 
  color: var(--sys-color-on-surface-variant); 
  opacity: 0.7; 
  margin-bottom: 2px; 
}
.si-val { 
  font-size: var(--font-size-m); 
  font-weight: var(--font-weight-bold); 
  color: var(--sys-color-on-surface-variant); 
  font-family: var(--sys-font-family-mono); /* Tabular data */
}

.row-actions { 
  display: grid; 
  grid-template-columns: 1fr 1fr auto; /* Two pills + strict icon width */
  gap: var(--spacing-xs); 
  margin-top: var(--spacing-m); 
}

/* Action Buttons */
.btn-action {
  display: flex; align-items: center; justify-content: center;
  padding: var(--spacing-s);
  border-radius: var(--shape-corner-m);
  font-weight: var(--font-weight-bold); 
  font-size: var(--font-size-s);
  text-decoration: none;
  border: 1px solid transparent;
  transition: filter 0.2s;
}
.btn-action.primary {
  background: var(--sys-color-primary);
  color: var(--sys-color-on-primary);
}
.btn-action.secondary {
  background: var(--sys-color-surface-container-highest);
  color: var(--sys-color-primary);
}
.btn-action:active { filter: brightness(0.9); transform: scale(0.98); }

/* Icon Button (Squircle) */
.btn-icon-action {
  display: flex; align-items: center; justify-content: center;
  width: 48px; height: 100%; /* Matches height of pills */
  border-radius: var(--shape-corner-m);
  border: none;
  cursor: pointer;
  background: var(--sys-color-surface-container-highest);
  color: var(--sys-color-primary);
  transition: background 0.2s;
}
.btn-icon-action:active { background: var(--sys-color-surface-variant); transform: scale(0.95); }

.mb-4 { margin-bottom: var(--spacing-m); }
</style>
