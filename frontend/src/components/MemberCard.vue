<script setup lang="ts">
import { computed } from 'vue'
import type { LeaderboardMember } from '../types'
import Icon from './Icon.vue'

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

// War History Bars
const historyBars = computed(() => {
  const hist = props.member.d.hist
  if (!hist || hist === '-') return []
  
  // Format: "Score WeekID | ..."
  let bars = hist.split('|').map(x => parseInt(x.trim().split(' ')[0] || '0') || 0).reverse()
  if (bars.length > 52) bars = bars.slice(-52)
  return bars
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
          <span style="opacity:0.3">•</span>
          <span>{{ (member.t || 0).toLocaleString() }} 🏆</span>
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
      <div class="viz-bars" v-if="historyBars.length">
        <div 
          v-for="(val, i) in historyBars" 
          :key="i"
          class="v-bar"
          :class="{ 'win': val > 2000, 'hit': val > 0 && val <= 2000 }"
          :style="{ height: Math.max(15, Math.min(100, (val/3200)*100)) + '%' }"
        ></div>
      </div>

      <!-- Action Grid -->
      <div class="btn-row">
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
        <button v-if="canShare" class="btn-action secondary" @click.stop="shareMember">
          Share
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 🃏 Neo-Card Styles */
.card {
  background: var(--sys-color-surface-container-low);
  border-radius: var(--shape-corner-l);
  padding: 20px;
  margin-bottom: 8px;
  border: 1px solid transparent;
  position: relative; overflow: hidden;
  transition: all 0.3s var(--sys-motion-spring);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.card:active { transform: scale(0.98); background: var(--sys-color-surface-container-high); }

.card.expanded { 
  box-shadow: var(--sys-elevation-3); 
  background: var(--sys-color-surface-container);
  z-index: 10; margin: 16px 0; 
}

.card.selected { background: var(--sys-color-secondary-container); }
.card.selected .player-name { color: var(--sys-color-on-secondary-container); }
.card.selected .meta-row { color: var(--sys-color-on-secondary-container); opacity: 0.8; }

.selection-indicator {
  position: absolute; left: 0; top: 0; bottom: 0; width: 6px;
  background: var(--sys-color-primary); opacity: 0; transition: opacity 0.2s;
}
.card.selected .selection-indicator { opacity: 1; }

.card-header { display: flex; justify-content: space-between; align-items: center; }
.info-stack { flex: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0; padding-right: 8px; }

.name-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap;}
.player-name { 
  font-size: 18px; font-weight: 600; 
  color: var(--sys-color-on-surface); 
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; letter-spacing: -0.3px; 
}

.meta-row { display: flex; align-items: center; gap: 12px; font-size: 14px; color: var(--sys-color-outline); font-weight: 500; }

.action-area { display: flex; align-items: center; gap: 12px; }

.chevron-btn {
  display: flex; align-items: center; justify-content: center;
  width: 32px; height: 32px;
  color: var(--sys-color-on-surface-variant);
  background: rgba(0,0,0,0.05);
  border-radius: 50%;
  transition: transform 0.3s var(--sys-motion-spring);
}
.card.expanded .chevron-btn { transform: rotate(180deg); background: rgba(0,0,0,0.1); }

/* Stat Pod */
.stat-pod {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  width: 64px; height: 64px; border-radius: 20px;
  background: var(--sys-color-surface-container-high);
  color: var(--sys-color-on-surface-variant);
  flex-shrink: 0;
  transition: background 0.3s;
}
.stat-pod.tone-high { background: var(--sys-color-primary-container); color: var(--sys-color-on-primary-container); }
.stat-pod.tone-mid { background: var(--sys-color-secondary-container); color: var(--sys-color-on-secondary-container); }
.stat-pod.tone-low { background: var(--sys-color-surface-variant); color: var(--sys-color-on-surface-variant); }

.stat-score { font-size: 20px; font-weight: 700; line-height: 1; letter-spacing: -1px; font-family: var(--sys-typescale-mono); }
.stat-sub { font-size: 9px; font-weight: 700; opacity: 0.8; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.5px; }

/* Grid & Body */
.card-body {
  max-height: 0; opacity: 0; overflow: hidden;
  transition: all 0.4s var(--sys-motion-spring);
  border-top: 1px solid transparent;
  margin-top: 0; padding-top: 0;
}
.card.expanded .card-body {
  max-height: 500px; opacity: 1;
  margin-top: 20px; padding-top: 20px;
  border-top-color: var(--sys-color-outline);
  border-top-width: 0.5px;
}

.grid-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 20px; }
.stat-item { background: var(--sys-color-surface-container-high); padding: 12px 8px; border-radius: var(--shape-corner-m); text-align: center; }
.si-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--sys-color-on-surface-variant); opacity: 0.7; margin-bottom: 4px; }
.si-val { font-size: 15px; font-weight: 600; color: var(--sys-color-on-surface-variant); }

.viz-bars { display: flex; gap: 1px; height: 40px; align-items: flex-end; margin: 20px 0; }
.v-bar { flex: 1 1 auto; background: var(--sys-color-surface-variant); border-radius: 1px; min-height: 4px; }
.v-bar.hit { background: var(--sys-color-secondary); }
.v-bar.win { background: var(--sys-color-primary); }

.btn-row { display: flex; gap: 12px; margin-top: 16px; }
</style>
