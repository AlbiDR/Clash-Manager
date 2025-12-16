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
  if (navigator.vibrate) navigator.vibrate(50) // Haptic Pop
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
            <Icon name="trophy" size="13" style="margin-left:2px; color:#fbbf24;" />
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
          class="btn-action secondary compact"
        >
          RoyaleAPI
        </a>
        <a 
          :href="`clashroyale://playerInfo?id=${member.id}`" 
          class="btn-action primary compact"
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
  background: var(--sys-color-surface-container);
  border-radius: var(--shape-corner-l);
  padding: 14px 16px;
  margin-bottom: 8px;
  position: relative; overflow: hidden;
  transition: all 0.3s var(--sys-motion-spring);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  display: grid;
  border: 1px solid rgba(255,255,255,0.03);
  /* Top lighting effect */
  box-shadow: 
    0 1px 0 rgba(255,255,255,0.05) inset,
    var(--sys-elevation-1);
}

.card:active { 
  transform: scale(0.985); 
  background: var(--sys-color-surface-container-high); 
}

.card.expanded { 
  box-shadow: var(--sys-elevation-3); 
  background: var(--sys-color-surface-container-high);
  z-index: 10; 
  margin: 16px 0;
  border-color: var(--sys-color-primary);
  /* Subtle glow in expanded state */
  box-shadow: 0 0 0 1px var(--sys-color-primary) inset, var(--sys-elevation-3);
}

.card.selected { 
  background: var(--sys-color-secondary-container); 
  box-shadow: none;
}
.card.selected .player-name { color: var(--sys-color-on-secondary-container); }
.card.selected .meta-row { color: var(--sys-color-on-secondary-container); opacity: 0.8; }

.selection-indicator {
  position: absolute; left: 0; top: 0; bottom: 0; width: 4px;
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
  gap: 4px;
  min-width: 0; 
}

.name-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap;}

.player-name { 
  font-family: var(--sys-font-family-body);
  font-size: 16px; 
  font-weight: var(--font-weight-heavy); 
  color: var(--sys-color-on-surface); 
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; 
  letter-spacing: -0.01em; 
}

.meta-row { 
  display: flex; align-items: center; 
  gap: 6px; 
  font-size: 13px; 
  color: var(--sys-color-outline); 
  font-weight: var(--font-weight-medium); 
}

.dot-separator { font-size: 8px; opacity: 0.5; }

.trophy-val { display: flex; align-items: center; }

.action-area { display: flex; align-items: center; gap: 12px; }

.chevron-btn {
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px;
  color: var(--sys-color-outline);
  background: rgba(0,0,0,0.03);
  border-radius: 50%;
  transition: all 0.3s var(--sys-motion-spring);
}
.card.expanded .chevron-btn { transform: rotate(180deg); background: rgba(0,0,0,0.1); color: var(--sys-color-on-surface); }


/* STAT POD */
.stat-pod {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  width: 52px; height: 52px; 
  border-radius: 16px; 
  background: var(--sys-color-surface-container-highest);
  color: var(--sys-color-on-surface-variant);
  flex-shrink: 0;
  transition: all 0.3s;
  border: 1px solid rgba(255,255,255,0.05);
}

/* Gradients for Pods */
.stat-pod.tone-high { 
  background: linear-gradient(135deg, var(--sys-color-primary-container), var(--sys-color-primary));
  color: var(--sys-color-on-primary);
  border: none;
}
.stat-pod.tone-mid { 
  background: linear-gradient(135deg, var(--sys-color-secondary-container), var(--sys-color-secondary)); 
  color: var(--sys-color-on-secondary);
  border: none;
}
.stat-pod.tone-low { 
  background: var(--sys-color-surface-container-highest); 
}

.stat-score { 
  font-size: 18px; 
  font-weight: 800; 
  line-height: 1; 
  letter-spacing: -0.5px; 
  font-family: var(--sys-font-family-mono); 
}
.stat-sub { 
  font-size: 7px; 
  font-weight: 800; 
  opacity: 0.8; 
  margin-top: 2px; 
  text-transform: uppercase; 
  letter-spacing: 0.5px; 
}

/* EXPANDED BODY */
.card-body {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  transition: grid-template-rows 0.4s var(--sys-motion-spring), opacity 0.4s ease, margin-top 0.4s ease;
  overflow: hidden;
  margin-top: 0;
}
.card-body > div { min-height: 0; }

.card.expanded .card-body {
  grid-template-rows: 1fr;
  opacity: 1;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--sys-color-outline-variant);
  border-top-style: dashed;
}

.grid-stats { 
  display: grid; 
  grid-template-columns: repeat(3, 1fr); 
  gap: 8px; 
  margin-bottom: 16px; 
}

.stat-item { 
  background: var(--sys-color-surface-container); /* Slightly darker inset */
  padding: 10px 8px; 
  border-radius: 12px; 
  text-align: center; 
  border: 1px solid rgba(255,255,255,0.02);
}
.si-label { 
  font-size: 9px; 
  font-weight: 700; 
  text-transform: uppercase; 
  color: var(--sys-color-outline); 
  margin-bottom: 2px; 
  letter-spacing: 0.02em;
}
.si-val { 
  font-size: 14px; 
  font-weight: 700; 
  color: var(--sys-color-on-surface); 
  font-family: var(--sys-font-family-mono); 
}

.row-actions { 
  display: grid; 
  grid-template-columns: 1fr 1fr auto; 
  gap: 8px; 
  margin-top: 8px;
}

/* Icon Button (Squircle) */
.btn-icon-action {
  display: flex; align-items: center; justify-content: center;
  width: 48px; height: 100%; 
  border-radius: var(--shape-corner-full); 
  border: none;
  cursor: pointer;
  background: var(--sys-color-surface-container-highest);
  color: var(--sys-color-primary);
  transition: background 0.2s;
}
.btn-icon-action:active { background: var(--sys-color-surface-variant); transform: scale(0.95); }

.mb-4 { margin-bottom: 16px; }
</style>
