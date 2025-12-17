<script setup lang="ts">
import { computed } from 'vue'
import type { LeaderboardMember } from '../types'
import Icon from './Icon.vue'
import WarHistoryChart from './WarHistoryChart.vue'

const props = defineProps<{
  id: string
  member: LeaderboardMember
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
  const r = props.member.d.role?.toLowerCase()
  if (r === 'leader') return 'Leader'
  if (r === 'coleader' || r === 'co-leader') return 'Co-Leader'
  if (r === 'elder') return 'Elder'
  return 'Member'
})

const trend = computed(() => {
  const dt = props.member.dt || 0
  if (dt === 0) return null
  return {
    val: (dt > 0 ? '+' : '') + Math.round(dt),
    dir: dt > 0 ? 'up' : 'down'
  }
})

import { useLongPress } from '../composables/useLongPress'
const { isLongPress, start: startPress, cancel: cancelPress } = useLongPress(() => {
  emit('toggle-select')
})

function handleClick(e: Event) {
  if (isLongPress.value) { isLongPress.value = false; return }
  if ((e.target as HTMLElement).closest('.btn-action') || (e.target as HTMLElement).closest('a')) return
  if (props.selectionMode) emit('toggle-select')
  else emit('toggle')
}
</script>

<template>
  <div 
    class="card squish-interaction"
    :class="{ 'expanded': expanded, 'selected': selected }"
    @click="handleClick"
    @mousedown="startPress"
    @touchstart="startPress"
    @mouseup="cancelPress"
    @touchend="cancelPress"
  >
    <div class="card-header">
      <div class="identity-group">
        <!-- Stacked Badges -->
        <div class="meta-stack">
          <div class="badge tenure">{{ member.d.days }}d</div>
          <div class="badge role">{{ roleDisplay }}</div>
        </div>
        
        <!-- Name and Trophies -->
        <div class="name-block">
          <span class="player-name">{{ member.n }}</span>
          <div class="trophy-meta">
            <Icon name="trophy" size="12" />
            <span class="trophy-val">{{ (member.t || 0).toLocaleString() }}</span>
          </div>
        </div>
      </div>

      <!-- Score Pod with Momentum Pill -->
      <div class="score-section">
        <div class="stat-pod" :class="toneClass">
          <span class="stat-score">{{ Math.round(member.s || 0) }}</span>
          <div v-if="trend" class="momentum-pill" :class="trend.dir">
            <Icon :name="trend.dir === 'up' ? 'trend_up' : 'trend_down'" size="10" />
            <span class="trend-val">{{ trend.val }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="card-body" v-if="expanded">
      <div class="stats-grid">
        <div class="stat-item">
          <span class="label">Daily Avg</span>
          <span class="value">{{ member.d.avg }}</span>
        </div>
        <div class="stat-item">
          <span class="label">War Rate</span>
          <span class="value">{{ member.d.rate }}</span>
        </div>
        <div class="stat-item">
          <span class="label">Last Seen</span>
          <span class="value">{{ member.d.seen }}</span>
        </div>
      </div>
      
      <WarHistoryChart :history="member.d.hist" />

      <div class="actions">
        <a :href="`clashroyale://playerInfo?id=${member.id}`" class="btn-action primary">
          <Icon name="crown" size="16" />
          <span>Open Game</span>
        </a>
        <a :href="`https://royaleapi.com/player/${member.id}`" target="_blank" class="btn-action">
          <Icon name="analytics" size="16" />
        </a>
      </div>
    </div>
  </div>
</template>

<style scoped>
.card {
  background: var(--sys-color-surface-container);
  border-radius: 20px;
  padding: 12px 16px;
  margin-bottom: 8px;
  border: 1px solid var(--sys-surface-glass-border);
  cursor: pointer;
  overflow: hidden;
}

.card.expanded {
  background: var(--sys-color-surface-container-high);
  box-shadow: var(--sys-elevation-3);
  margin: 16px 0;
  border-color: var(--sys-color-primary);
}

.card.selected { background: var(--sys-color-primary-container); border-color: var(--sys-color-primary); }

.card-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }

.identity-group { display: flex; align-items: center; gap: 14px; flex: 1; min-width: 0; }

.meta-stack { display: flex; flex-direction: column; gap: 4px; }

.badge {
  height: 18px; padding: 0 6px;
  background: var(--sys-color-surface-container-highest);
  border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 800; color: var(--sys-color-outline);
  font-family: var(--sys-font-family-mono);
  text-transform: uppercase;
}
.badge.role { color: var(--sys-color-primary); font-family: var(--sys-font-family-body); font-weight: 700; font-size: 9px; }

.name-block { display: flex; flex-direction: column; min-width: 0; }

.player-name {
  font-size: 16px; font-weight: 850;
  color: var(--sys-color-on-surface);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  letter-spacing: -0.02em;
  line-height: 1.1;
}

.trophy-meta { display: flex; align-items: center; gap: 4px; color: #fbbf24; margin-top: 2px; }
.trophy-val { font-size: 13px; font-weight: 700; font-family: var(--sys-font-family-mono); }

.stat-pod {
  position: relative;
  width: 48px; height: 48px;
  background: var(--sys-color-surface-container-highest);
  border-radius: 14px;
  display: flex; align-items: center; justify-content: center;
  font-size: 18px; font-weight: 900;
  font-family: var(--sys-font-family-mono);
}

.stat-pod.tone-high { background: var(--sys-color-primary); color: var(--sys-color-on-primary); }
.stat-pod.tone-mid { background: var(--sys-color-secondary-container); color: var(--sys-color-on-secondary-container); }

.momentum-pill {
  position: absolute; bottom: -6px; right: -8px;
  height: 20px; padding: 0 6px;
  background: var(--sys-color-surface-container-highest);
  border-radius: 10px;
  display: flex; align-items: center; gap: 3px;
  box-shadow: 0 4px 10px rgba(0,0,0,0.15);
  border: 1.5px solid var(--sys-surface-glass-border);
}
.momentum-pill.up { color: #22c55e; }
.momentum-pill.down { color: #ef4444; }

.trend-val { font-size: 10px; font-weight: 900; font-family: var(--sys-font-family-mono); }

.card-body { margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(0,0,0,0.05); }

.stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px; }
.stat-item { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.stat-item .label { font-size: 10px; text-transform: uppercase; font-weight: 800; opacity: 0.5; }
.stat-item .value { font-size: 14px; font-weight: 800; font-family: var(--sys-font-family-mono); }

.actions { display: flex; gap: 8px; margin-top: 16px; }
.btn-action {
  flex: 1; height: 44px; border-radius: 12px;
  display: flex; align-items: center; justify-content: center; gap: 8px;
  background: var(--sys-color-surface-container-highest);
  color: var(--sys-color-on-surface);
  font-weight: 700; text-decoration: none;
}
.btn-action.primary { background: var(--sys-color-primary); color: var(--sys-color-on-primary); }
</style>
