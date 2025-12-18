<script setup lang="ts">
import { ref, computed } from 'vue'
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

// --- INTERACTION PROTECTION (Swipe Safety) ---
const dragThreshold = 5
const startPos = ref({ x: 0, y: 0 })

function handleInteractionStart(e: MouseEvent | TouchEvent) {
  const touch = 'touches' in e ? e.touches[0] : (e as MouseEvent)
  startPos.value = { x: touch.clientX, y: touch.clientY }
}

function shouldExecute(e: MouseEvent | TouchEvent): boolean {
  const touch = 'changedTouches' in e ? e.changedTouches[0] : (e as MouseEvent)
  const dx = Math.abs(touch.clientX - startPos.value.x)
  const dy = Math.abs(touch.clientY - startPos.value.y)
  return dx < dragThreshold && dy < dragThreshold
}

const toneClass = computed(() => {
  const score = props.member.s || 0
  if (score >= 80) return 'tone-high'
  if (score >= 50) return 'tone-mid'
  return 'tone-low'
})

const roleInfo = computed(() => {
  const r = props.member.d.role?.toLowerCase() || ''
  if (r.includes('leader') && !r.includes('co')) return { label: 'Leader', class: 'role-leader' }
  if (r.includes('coleader') || r.includes('co-leader')) return { label: 'Co-Lead', class: 'role-coleader' }
  if (r.includes('elder')) return { label: 'Elder', class: 'role-elder' }
  return { label: 'Member', class: 'role-member' }
})

const trend = computed(() => {
  const dt = props.member.dt || 0
  const currentRaw = props.member.r || 0
  if (dt === 0 || currentRaw === 0) return null
  
  const previousRaw = currentRaw - dt
  if (previousRaw <= 0) return null 
  
  const percentChange = (dt / previousRaw) * 100
  
  return {
    val: Math.round(Math.abs(percentChange)) + '%',
    dir: dt > 0 ? 'up' : 'down'
  }
})

function onPodClick(e: MouseEvent | TouchEvent) {
  if (!shouldExecute(e)) return
  e.stopPropagation()
  emit('toggle')
}

function onContentClick(e: MouseEvent | TouchEvent) {
  if (!shouldExecute(e)) return
  const target = e.target as HTMLElement
  if (target.closest('.btn-action') || target.closest('a')) return
  
  if (props.selectionMode) {
    emit('toggle-select')
  } else {
    emit('toggle')
  }
}
</script>

<template>
  <div 
    class="card squish-interaction"
    :class="{ 'expanded': expanded, 'selected': selected }"
    @mousedown="handleInteractionStart"
    @touchstart="handleInteractionStart"
    @mouseup="onContentClick"
    @touchend="onContentClick"
  >
    <div class="card-header">
      <!-- Zone: Identity (Selection/Standard Toggle) -->
      <div class="identity-group">
        <div class="meta-stack">
          <div class="badge tenure">{{ member.d.days }}d</div>
          <div class="badge role" :class="roleInfo.class">{{ roleInfo.label }}</div>
        </div>
        
        <div class="name-block">
          <span class="player-name">{{ member.n }}</span>
          <div class="trophy-meta">
            <Icon name="trophy" size="12" />
            <span class="trophy-val">{{ (member.t || 0).toLocaleString() }}</span>
          </div>
        </div>
      </div>

      <!-- Zone: Inspect (Score Pod always toggles expansion) -->
      <div class="score-section" @mouseup.stop="onPodClick" @touchend.stop="onPodClick">
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
        <!-- RoyaleAPI on the Left -->
        <a :href="`https://royaleapi.com/player/${member.id}`" target="_blank" class="btn-action">
          <Icon name="analytics" size="16" />
          <span>RoyaleAPI</span>
        </a>
        <!-- Open Game on the Right -->
        <a :href="`clashroyale://playerInfo?id=${member.id}`" class="btn-action primary">
          <Icon name="crown" size="16" />
          <span>Open Game</span>
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
  position: relative;
  overflow: visible;
  user-select: none;
  -webkit-user-select: none;
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

.meta-stack { display: flex; flex-direction: column; gap: 4px; width: 60px; flex-shrink: 0; }

.badge {
  height: 18px; width: 100%;
  background: var(--sys-color-surface-container-highest);
  border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 800; color: var(--sys-color-outline);
  font-family: var(--sys-font-family-mono);
  text-transform: uppercase;
}

/* Monochromatic Vibrancy Engine */
.badge.role { font-family: var(--sys-font-family-body); font-weight: 900; font-size: 9px; }
.role-leader { background: var(--sys-color-primary); color: var(--sys-color-on-primary); }
.role-coleader { background: rgba(var(--sys-color-primary-rgb), 0.7); color: white; }
.role-elder { background: rgba(var(--sys-color-primary-rgb), 0.35); color: var(--sys-color-primary); }
.role-member { background: rgba(var(--sys-color-primary-rgb), 0.12); color: var(--sys-color-outline); }

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

.score-section { cursor: zoom-in; }

.stat-pod {
  position: relative;
  width: 48px; height: 48px;
  background: var(--sys-color-surface-container-highest);
  border-radius: 14px;
  display: flex; align-items: center; justify-content: center;
  font-size: 18px; font-weight: 900;
  font-family: var(--sys-font-family-mono);
  transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}
.stat-pod:active { transform: scale(0.92); }

.stat-pod.tone-high { background: var(--sys-color-primary); color: var(--sys-color-on-primary); }
.stat-pod.tone-mid { background: var(--sys-color-secondary-container); color: var(--sys-color-on-secondary-container); }

.momentum-pill {
  position: absolute; bottom: -8px; left: 50%;
  transform: translateX(-50%);
  height: 18px; padding: 0 6px;
  background: var(--sys-color-surface-container-highest);
  border-radius: 10px;
  display: flex; align-items: center; gap: 2px;
  box-shadow: 0 4px 8px rgba(0,0,0,0.15);
  z-index: 2;
  border: 1px solid var(--sys-surface-glass-border);
}

.momentum-pill.up { color: #22c55e; }
.momentum-pill.down { color: #ef4444; }

.trend-val { font-size: 9px; font-weight: 900; font-family: var(--sys-font-family-mono); }

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
