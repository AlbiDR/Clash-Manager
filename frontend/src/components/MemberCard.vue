
<script setup lang="ts">
import { ref, computed } from 'vue'
import type { LeaderboardMember } from '../types'
import Icon from './Icon.vue'
import WarHistoryChart from './WarHistoryChart.vue'
import { useBenchmarking } from '../composables/useBenchmarking'
import { useModules } from '../composables/useModules'

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

const { getBenchmark } = useBenchmarking()
const { modules } = useModules()

// --- INTERACTION ENGINE ---
const isScrolling = ref(false)
const touchStartTime = ref(0)
const longPressTimer = ref<number | null>(null)

function onTouchStart() {
    isScrolling.value = false
    touchStartTime.value = Date.now()
    
    if (longPressTimer.value) clearTimeout(longPressTimer.value)
    longPressTimer.value = window.setTimeout(() => {
        if (!isScrolling.value) {
            if (navigator.vibrate) navigator.vibrate(60)
            emit('toggle-select')
        }
    }, 600)
}

function onTouchMove() {
    isScrolling.value = true
    if (longPressTimer.value) {
        clearTimeout(longPressTimer.value)
        longPressTimer.value = null
    }
}

function onTouchEnd() {
    if (longPressTimer.value) {
        clearTimeout(longPressTimer.value)
        longPressTimer.value = null
    }
}

function handleContextMenu(e: Event) {
    e.preventDefault()
    if (navigator.vibrate) navigator.vibrate(40)
    emit('toggle-select')
}

function handleScoreClick(e: Event) {
    e.stopPropagation()
    if (navigator.vibrate) navigator.vibrate(20)
    emit('toggle-select')
}

function handleExpandClick(e: Event) {
    e.stopPropagation()
    if (navigator.vibrate) navigator.vibrate(10)
    emit('toggle')
}

function handleMainClick(e: MouseEvent | TouchEvent) {
  if (isScrolling.value) return
  
  const pressDuration = touchStartTime.value > 0 ? Date.now() - touchStartTime.value : 0
  if (pressDuration > 550) return

  const target = e.target as HTMLElement
  if (target.closest('.btn-action') || target.closest('a') || target.closest('.hit-target')) return
  
  if (props.selectionMode) {
      emit('toggle-select')
  } else {
      emit('toggle')
  }
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
    dir: dt > 0 ? 'up' : 'down',
    raw: dt
  }
})
</script>

<template>
  <div 
    class="card squish-interaction"
    :class="{ 'expanded': expanded, 'selected': selected }"
    @touchstart="onTouchStart"
    @touchmove="onTouchMove"
    @touchend="onTouchEnd"
    @click="handleMainClick"
    @contextmenu.prevent="handleContextMenu"
  >
    <div class="card-header">
      <div class="identity-group">
        <div class="meta-stack">
          <div class="badge tenure hit-target" v-tooltip="modules.ghostBenchmarking ? getBenchmark('lb', 'tenure', member.d.days) : null">{{ member.d.days }}d</div>
          <div class="badge role" :class="roleInfo.class">{{ roleInfo.label }}</div>
        </div>
        
        <div class="name-block">
          <span class="player-name">{{ member.n }}</span>
          <div class="trophy-meta hit-target" v-tooltip="modules.ghostBenchmarking ? getBenchmark('lb', 'trophies', member.t) : null">
            <Icon name="trophy" size="12" />
            <span class="trophy-val">{{ (member.t || 0).toLocaleString() }}</span>
          </div>
        </div>
      </div>

      <div class="header-actions">
        <div class="score-section" @click.stop="handleScoreClick">
          <div class="stat-pod hit-target" :class="toneClass" v-tooltip="modules.ghostBenchmarking ? getBenchmark('lb', 'score', member.s) : null">
            <span class="stat-score">{{ Math.round(member.s || 0) }}</span>
            <div v-if="trend" class="momentum-pill hit-target" :class="trend.dir" v-tooltip="modules.ghostBenchmarking ? getBenchmark('lb', 'momentum', trend.raw) : null">
              <Icon :name="trend.dir === 'up' ? 'trend_up' : 'trend_down'" size="10" />
              <span class="trend-val">{{ trend.val }}</span>
            </div>
          </div>
        </div>
        <button class="expand-btn hit-target" @click.stop="handleExpandClick" :class="{ 'is-active': expanded }">
          <Icon name="chevron_down" size="20" />
        </button>
      </div>
    </div>

    <div class="card-body" v-if="expanded">
      <div class="stats-grid">
        <div class="stat-item hit-target" v-tooltip="modules.ghostBenchmarking ? getBenchmark('lb', 'donations', member.d.avg) : null">
          <span class="label">Daily Avg</span>
          <span class="value">{{ member.d.avg }}</span>
        </div>
        <div class="stat-item hit-target" v-tooltip="modules.ghostBenchmarking ? getBenchmark('lb', 'warRate', parseFloat(member.d.rate || '0')) : null">
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
        <a :href="`https://royaleapi.com/player/${member.id}`" target="_blank" class="btn-action">
          <Icon name="analytics" size="16" />
          <span>RoyaleAPI</span>
        </a>
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
  border: 1.5px solid transparent;
  cursor: pointer;
  position: relative;
  overflow: visible;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
  transition: all 0.2s var(--sys-motion-spring);
}

.card.expanded {
  background: var(--sys-color-surface-container-high);
  box-shadow: var(--sys-elevation-3);
  margin: 16px 0;
  border-color: rgba(var(--sys-color-primary-rgb), 0.3);
}

.card.selected { 
  background: var(--sys-color-primary-container) !important; 
  border: 2.5px solid var(--sys-color-primary);
  transform: scale(0.97);
  box-shadow: 0 4px 12px rgba(var(--sys-color-primary-rgb), 0.15);
}

/* 🎯 High Contrast Rules for Selection - Forced Legibility */
.card.selected .player-name,
.card.selected .trophy-val,
.card.selected .stat-score,
.card.selected .stat-item .label,
.card.selected .stat-item .value,
.card.selected .trend-val,
.card.selected .expand-btn { 
  color: var(--sys-color-on-primary-container) !important; 
  opacity: 1 !important;
}

/* Fix for the Score Pod bug - ensures all pods look identical when selected */
.card.selected .stat-pod {
  background: rgba(var(--sys-color-on-primary-container-rgb, 0,29,54), 0.12) !important;
  color: var(--sys-color-on-primary-container) !important;
  border: 1px solid rgba(var(--sys-color-on-primary-container-rgb), 0.1);
}

.card.selected .badge:not(.role) { 
  background: rgba(var(--sys-color-on-primary-container-rgb, 0,29,54), 0.1) !important; 
  color: var(--sys-color-on-primary-container) !important;
  border: none;
}

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

.hit-target { position: relative; z-index: 5; }
.hit-target::after { content: ''; position: absolute; inset: -4px; }

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

.trophy-meta { display: flex; align-items: center; gap: 4px; color: #fbbf24; margin-top: 2px; width: fit-content; }
.trophy-val { font-size: 13px; font-weight: 700; font-family: var(--sys-font-family-mono); }

.header-actions { display: flex; align-items: center; gap: 4px; }

.expand-btn {
  background: none; border: none; padding: 8px;
  color: var(--sys-color-outline);
  cursor: pointer; transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.expand-btn.is-active { transform: rotate(180deg); color: var(--sys-color-primary); }

.stat-pod {
  position: relative;
  width: 48px; height: 48px;
  background: var(--sys-color-surface-container-highest);
  border-radius: 14px;
  display: flex; align-items: center; justify-content: center;
  font-size: 18px; font-weight: 900;
  font-family: var(--sys-font-family-mono);
  transition: transform 0.2s;
}
.stat-pod:hover { transform: scale(1.05); }

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
  z-index: 10;
  border: 1px solid var(--sys-surface-glass-border);
}

.momentum-pill.up { color: #22c55e; }
.momentum-pill.down { color: #ef4444; }

.trend-val { font-size: 9px; font-weight: 900; font-family: var(--sys-font-family-mono); }

.card-body { 
  margin-top: 16px; 
  padding-top: 16px; 
  border-top: 1px solid rgba(0,0,0,0.05);
  animation: fade-in 0.3s ease;
}

@keyframes fade-in { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }

.stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px; }
.stat-item { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 4px; border-radius: 8px; transition: background 0.2s; }
.stat-item .label { font-size: 10px; text-transform: uppercase; font-weight: 800; opacity: 0.5; }
.stat-item .value { font-size: 14px; font-weight: 800; font-family: var(--sys-font-family-mono); }

.actions { display: flex; gap: 8px; margin-top: 16px; }
.btn-action {
  flex: 1; height: 44px; border-radius: 12px;
  display: flex; align-items: center; justify-content: center; gap: 8px;
  background: var(--sys-color-surface-container-highest);
  color: var(--sys-color-on-surface);
  font-weight: 700; text-decoration: none; border: none; cursor: pointer;
}
.btn-action.primary { background: var(--sys-color-primary); color: var(--sys-color-on-primary); }
</style>

