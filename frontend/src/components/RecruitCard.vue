<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Recruit } from '../types'
import Icon from './Icon.vue'

const props = defineProps<{
  id: string
  recruit: Recruit
  expanded: boolean
  selected: boolean
  selectionMode: boolean
}>()

const emit = defineEmits<{
  'toggle-expand': []
  'toggle-select': []
}>()

// Tonal Palette Logic
const toneClass = computed(() => {
  const score = props.recruit.s || 0
  if (score >= 80) return 'tone-high'
  if (score >= 50) return 'tone-mid'
  return 'tone-low'
})

// Time Ago
const timeAgo = computed(() => {
  const dateStr = props.recruit.d.ago
  if (!dateStr) return '-'
  const ts = new Date(dateStr).getTime()
  const m = Math.floor((Date.now() - ts) / 60000)
  if (m < 1) return 'Just now'
  return m > 60 ? Math.floor(m/60) + 'h ago' : m + 'm ago'
})

// Long Press Logic
let lpTimer: any = null
const lpDuration = 500
const isLongPress = ref(false)

function startPress() {
  isLongPress.value = false
  lpTimer = setTimeout(() => {
    isLongPress.value = true
    if (navigator.vibrate) navigator.vibrate(50)
    emit('toggle-select')
  }, lpDuration)
}

// Share Logic
const canShare = typeof navigator !== 'undefined' && !!navigator.share

function shareRecruit() {
  if (navigator.share) {
    navigator.share({
      title: `Recruit: ${props.recruit.n}`,
      text: `Found a potential recruit: ${props.recruit.n} (Score: ${Math.round(props.recruit.s || 0)})`,
      url: `https://royaleapi.com/player/${props.recruit.id}`
    }).catch(console.error)
  }
}

function cancelPress() {
  if (lpTimer) {
    clearTimeout(lpTimer)
    lpTimer = null
  }
}

function handleClick(e: Event) {
  if (isLongPress.value) {
    isLongPress.value = false
    return
  }
  
  if ((e.target as HTMLElement).closest('.btn-action') || (e.target as HTMLElement).closest('a')) return
  
  if ((e.target as HTMLElement).closest('.chevron-btn')) {
    emit('toggle-expand')
    return
  }

  if (props.selectionMode) {
    emit('toggle-select')
  } else {
    emit('toggle-expand')
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
          <span class="player-name">{{ recruit.n }}</span>
        </div>
        <div class="meta-row">
          <span>{{ timeAgo }}</span>
          <span style="opacity:0.3">•</span>
          <span>{{ (recruit.t || 0).toLocaleString() }} 🏆</span>
        </div>
      </div>

      <div class="action-area">
        <div class="stat-pod" :class="toneClass">
          <div class="stat-score">{{ Math.round(recruit.s || 0) }}</div>
          <div class="stat-sub">POTENTIAL</div>
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
          <div class="si-label">Donations</div>
          <div class="si-val">{{ recruit.d.don }}</div>
        </div>
        <div class="stat-item">
          <div class="si-label">War Wins</div>
          <div class="si-val">{{ recruit.d.war }}</div>
        </div>
        <div class="stat-item">
          <div class="si-label">Cards Won</div>
          <div class="si-val">{{ recruit.d.cards || '-' }}</div>
        </div>
      </div>

      <div class="btn-row">
        <a 
          :href="`https://royaleapi.com/player/${recruit.id}`" 
          target="_blank"
          class="btn-action secondary"
        >
          RoyaleAPI
        </a>
        <a 
          :href="`clashroyale://playerInfo?id=${recruit.id}`" 
          class="btn-action primary"
        >
          Clash Royale
        </a>
        <button v-if="canShare" class="btn-action secondary" @click.stop="shareRecruit">
          Share
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 🃏 Neo-Card Styles (Shared) */
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

.btn-row { display: flex; gap: 12px; margin-top: 16px; }
</style>
