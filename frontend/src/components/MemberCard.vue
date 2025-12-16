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

const role = computed(() => (props.member.d.role || '').toLowerCase())

const roleDisplay = computed(() => {
  if (['leader', 'co-leader', 'coleader', 'elder', 'member'].includes(role.value)) {
    if (role.value === 'coleader' || role.value === 'co-leader') return 'Co-Leader'
    return role.value.charAt(0).toUpperCase() + role.value.slice(1)
  }
  return null
})

const roleBadgeClass = computed(() => {
  if (role.value === 'leader') return 'role-leader'
  if (role.value === 'co-leader' || role.value === 'coleader') return 'role-co-leader'
  if (role.value === 'elder') return 'role-elder'
  return 'role-member'
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

    <!-- Header (Strict Height Enforced) -->
    <div class="card-header">
      <div class="info-stack">
        <!-- Row 1, Col 1 -->
        <span class="tenure-badge">{{ member.d.days }}d</span>
        <!-- Row 1, Col 2 -->
        <span class="player-name">{{ member.n }}</span>
        
        <!-- Row 2, Col 1 -->
        <span v-if="roleDisplay" class="role-badge" :class="roleBadgeClass">{{ roleDisplay }}</span>
        <!-- Row 2, Col 2 -->
        <span class="meta-val trophy-val">
          <Icon name="trophy" size="12" style="color:#fbbf24;" />
          <span class="trophy-text">{{ (member.t || 0).toLocaleString() }}</span>
        </span>
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
      <div class="body-inner">
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
            :href="`https://royaleapi.com/player/${member.id}`" 
            target="_blank"
            class="btn-action secondary compact"
          >
            <Icon name="analytics" size="14" />
            <span>RoyaleAPI</span>
          </a>
          <a 
            :href="`clashroyale://playerInfo?id=${member.id}`" 
            class="btn-action primary compact"
          >
            <Icon name="crown" size="14" />
            <span>Open Game</span>
          </a>
          <button v-if="canShare" class="btn-icon-action" @click.stop="shareMember">
            <Icon name="share" size="16" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 🃏 Card Base */
.card {
  background: var(--sys-color-surface-container);
  border-radius: 16px;
  /* STRICT PADDING: ensures vertical size is consistent */
  padding: 8px 12px;
  margin-bottom: 6px;
  position: relative; overflow: hidden;
  transition: background 0.2s, box-shadow 0.2s, border-color 0.2s;
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
  box-shadow: 0 4px 16px rgba(0,0,0,0.15), 0 0 0 1px rgba(var(--sys-color-primary-rgb), 0.1) inset;
  border-color: rgba(var(--sys-color-primary-rgb), 0.3);
  z-index: 10;
  margin: 12px 0;
}

.card.selected { 
  background: var(--sys-color-secondary-container); 
}
.card.selected .player-name { color: var(--sys-color-on-secondary-container); }
.card.selected .meta-val { color: var(--sys-color-on-secondary-container); opacity: 0.8; }
.card.selected .role-badge { 
    background: rgba(var(--sys-color-on-secondary-container-rgb), 0.15);
    color: var(--sys-color-on-secondary-container);
    border-color: rgba(var(--sys-color-on-secondary-container-rgb), 0.3);
    opacity: 1;
}
.card.selected .tenure-badge {
  background: rgba(var(--sys-color-on-secondary-container-rgb), 0.1);
  color: var(--sys-color-on-secondary-container);
}

.selection-indicator {
  position: absolute; left: 0; top: 0; bottom: 0; width: 4px;
  background: var(--sys-color-primary); opacity: 0; transition: opacity 0.2s;
}
.card.selected .selection-indicator { opacity: 1; }

/* HEADER - STRICT HEIGHT */
.card-header { 
  display: flex; justify-content: space-between; align-items: center;
  height: 40px; /* Locked Height */
}

.info-stack { 
  display: grid;
  grid-template-columns: max-content 1fr;
  grid-template-rows: 1fr 1fr;
  gap: 4px 8px; /* row-gap column-gap */
  align-items: center;
  flex: 1; 
  min-width: 0; 
}

.player-name { 
  font-size: 15px; font-weight: 750; color: var(--sys-color-on-surface); 
  letter-spacing: -0.01em;
  line-height: 1.2;
  /* Truncation */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0; /* For grid truncation */
}

.meta-val { font-size: 12px; font-weight: 500; color: var(--sys-color-outline); line-height: 1.2; }

.trophy-val { 
  display: flex; 
  align-items: center; 
  flex-shrink: 0;
}

.action-area { display: flex; align-items: center; gap: 10px; height: 100%; }

/* Tenure Badge */
.tenure-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 20px;
  width: 75px;
  padding: 0 6px;
  border-radius: 6px;
  background: var(--sys-color-surface-container-highest);
  color: var(--sys-color-outline);
  font-size: 11px;
  font-weight: 700;
  font-family: var(--sys-font-family-mono);
  flex-shrink: 0;
}

/* Role Badge */
.role-badge {
  display: inline-block;
  width: 75px;
  text-align: center;
  font-size: 9.5px; /* Slightly smaller to prevent wrapping */
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.02em; /* Tighter spacing */
  white-space: nowrap; /* Failsafe to prevent breaking layout */
  box-sizing: border-box; /* Ensure padding is included in width */
  padding: 3px 8px;
  border-radius: 6px;
  border: 1px solid transparent;
  flex-shrink: 0;
  transition: all 0.2s;
}

/* --- Role Badge Hierarchy (Corrected) --- */

/* Level 1: Member (Base) */
.role-member {
  background: var(--sys-color-surface-container-high);
  color: var(--sys-color-on-surface-variant);
  opacity: 0.9;
  border: 1px solid var(--sys-color-surface-container-highest);
}

/* Level 2: Elder (Tertiary color, subtle depth) */
.role-elder {
  background: var(--sys-color-tertiary-container);
  color: var(--sys-color-on-tertiary-container);
  border: 1px solid var(--sys-color-outline-variant);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.05); /* Subtle inner depth */
}

/* Level 3: Co-Leader (Secondary color, active glow) */
.role-co-leader {
  background: var(--sys-color-secondary-container);
  color: var(--sys-color-on-secondary-container);
  border: 1px solid var(--sys-color-secondary);
  box-shadow: 0 0 8px rgba(var(--sys-color-secondary-rgb), 0.4); /* Glow effect */
}

/* Level 4: Leader (Premium) */
.role-leader {
  /* Visual Clues: Gradient, strong glow, inner shine, and bolder font */
  background: linear-gradient(145deg, var(--sys-color-primary-container), var(--sys-color-primary));
  color: var(--sys-color-on-primary);
  border: none; /* Gradient is enough */
  font-weight: 800; /* Bolder */
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  box-shadow: 
    0 0 10px rgba(var(--sys-color-primary-rgb), 0.5), /* Stronger glow */
    inset 0 1px 1px rgba(255, 255, 255, 0.3); /* Inner shine */
}

/* 💎 NEO-MATERIAL STAT POD */
.stat-pod {
  display: flex; align-items: center; justify-content: center;
  width: 40px; height: 40px; /* Locked Size matching header */
  border-radius: 12px;
  background: var(--sys-color-surface-container-highest);
  color: var(--sys-color-on-surface-variant);
  font-weight: 800; font-size: 14px;
  font-family: var(--sys-font-family-mono);
  box-shadow: 
    inset 0 1px 0 rgba(255,255,255,0.1), 
    0 2px 4px rgba(0,0,0,0.1);
  border: 1px solid rgba(255,255,255,0.05);
}

.stat-pod.tone-high { 
  background: linear-gradient(135deg, var(--sys-color-primary-container), var(--sys-color-primary));
  color: var(--sys-color-on-primary); 
  box-shadow: 
    inset 0 1px 0 rgba(255,255,255,0.3),
    0 2px 6px rgba(var(--sys-color-primary-rgb), 0.3);
  border: none;
}

.stat-pod.tone-mid { 
  background: linear-gradient(135deg, var(--sys-color-secondary-container), var(--sys-color-secondary)); 
  color: var(--sys-color-on-secondary); 
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.2);
  border: none;
}

.chevron-btn { color: var(--sys-color-outline); transition: transform 0.3s; }
.card.expanded .chevron-btn { transform: rotate(180deg); color: var(--sys-color-primary); }

/* BODY (ANIMATED COLLAPSE) */
.card-body {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.3s var(--sys-motion-spring), margin-top 0.3s ease, border-top 0.3s step-end;
  /* Reset collapsed state completely */
  margin-top: 0;
  padding-top: 0;
  border-top: 0 solid transparent;
  pointer-events: none;
}

.body-inner {
  min-height: 0;
  overflow: hidden;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.card.expanded .card-body {
  grid-template-rows: 1fr;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(255,255,255,0.05);
  pointer-events: auto;
}

.card.expanded .body-inner {
  opacity: 1;
  transition-delay: 0.1s;
}

/* STATS */
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

/* ACTIONS */
.actions-toolbar {
  display: flex; gap: 8px; margin-top: 8px;
}

.btn-action {
  flex: 1;
  display: flex; align-items: center; justify-content: center; gap: 6px;
  height: 36px;
  border-radius: 10px;
  font-size: 12px; font-weight: 700; text-decoration: none;
  transition: transform 0.1s, opacity 0.2s;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}
.btn-action:active { transform: scale(0.97); opacity: 0.9; }

.btn-action.primary { 
  background: linear-gradient(135deg, var(--sys-color-primary), #00508a); 
  color: white; 
  box-shadow: 0 4px 8px rgba(var(--sys-color-primary-rgb), 0.3), inset 0 1px 0 rgba(255,255,255,0.2);
}

.btn-action.secondary { 
  background: var(--sys-color-surface-container); 
  color: var(--sys-color-on-surface); 
  border: 1px solid rgba(255,255,255,0.05); 
}

.btn-icon-action {
  width: 36px; height: 36px;
  display: flex; align-items: center; justify-content: center;
  background: transparent; border: 1px solid rgba(255,255,255,0.1);
  color: var(--sys-color-primary); border-radius: 10px;
  cursor: pointer;
}
.trophy-text {
  display: inline-block;
  margin-left: 4px; /* Space between icon and text */
}
</style>
