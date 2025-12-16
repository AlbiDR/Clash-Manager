<script setup lang="ts">
import { computed } from 'vue'
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

// Composables
import { useLongPress } from '../composables/useLongPress'
import { useShare } from '../composables/useShare'

const { isLongPress, start: startPress, cancel: cancelPress } = useLongPress(() => {
  emit('toggle-select')
})

const { canShare, share } = useShare()

function shareRecruit() {
  share({
    title: `Recruit: ${props.recruit.n}`,
    text: `Found a potential recruit: ${props.recruit.n} (Score: ${Math.round(props.recruit.s || 0)})`,
    url: `https://royaleapi.com/player/${props.recruit.id}`
  })
}

function handleClick(e: Event) {
  if (isLongPress.value) {
    isLongPress.value = false
    return
  }
  
  if ((e.target as HTMLElement).closest('.btn-action') || (e.target as HTMLElement).closest('.btn-icon-action') || (e.target as HTMLElement).closest('a')) return
  
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
          <span class="dot-separator">•</span>
          <span class="trophy-val">
             {{ (recruit.t || 0).toLocaleString() }} 
             <Icon name="trophy" size="12" style="margin-left:2px; color:#fbbf24;" />
          </span>
        </div>
      </div>

      <div class="action-area">
        <div class="stat-pod" :class="toneClass">
          <div class="stat-score">{{ Math.round(recruit.s || 0) }}</div>
          <div class="stat-sub">POTENTIAL</div>
        </div>
        <div class="chevron-btn">
          <Icon name="chevron_down" size="18" />
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

      <div class="row-actions">
        <a 
          :href="`https://royaleapi.com/player/${recruit.id}`" 
          target="_blank"
          class="btn-action secondary compact"
        >
          RoyaleAPI
        </a>
        <a 
          :href="`clashroyale://playerInfo?id=${recruit.id}`" 
          class="btn-action primary compact"
        >
          Clash Royale
        </a>
        <button v-if="canShare" class="btn-icon-action secondary" @click.stop="shareRecruit">
          <Icon name="share" size="20" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 🃏 Neo-Card Styles (Shared) */
.card {
  background: var(--sys-color-surface-container);
  border-radius: var(--shape-corner-l);
  padding: 10px 14px; /* Slimmer Padding */
  margin-bottom: 6px; /* Tighter list */
  border: 1px solid rgba(255,255,255,0.03);
  box-shadow: 
    0 1px 0 rgba(255,255,255,0.05) inset,
    var(--sys-elevation-1);
  position: relative; overflow: hidden;
  transition: all 0.3s var(--sys-motion-spring);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  display: grid;
}

.card:active { 
  transform: scale(0.985); 
  background: var(--sys-color-surface-container-high); 
}

.card.expanded { 
  box-shadow: var(--sys-elevation-3); 
  background: var(--sys-color-surface-container-high);
  z-index: 10; margin: 12px 0;
  border-color: var(--sys-color-primary);
  box-shadow: 0 0 0 1px var(--sys-color-primary) inset, var(--sys-elevation-3);
  padding-bottom: 14px;
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
  gap: 2px;
  min-width: 0; 
}

.name-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap;}

.player-name { 
  font-family: var(--sys-font-family-body);
  font-size: 15px; 
  font-weight: var(--font-weight-heavy); 
  color: var(--sys-color-on-surface); 
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; 
  letter-spacing: -0.01em;
  line-height: 1.2;
}

.meta-row { 
  display: flex; align-items: center; 
  gap: 6px; 
  font-size: 12px; 
  color: var(--sys-color-outline); 
  font-weight: var(--font-weight-medium); 
  line-height: 1.2;
}

.dot-separator { font-size: 8px; opacity: 0.5; }

.action-area { display: flex; align-items: center; gap: 8px; }

.chevron-btn {
  display: flex; align-items: center; justify-content: center;
  width: 24px; height: 24px;
  color: var(--sys-color-outline);
  background: rgba(0,0,0,0.03);
  border-radius: 50%;
  transition: all 0.3s var(--sys-motion-spring);
}
.card.expanded .chevron-btn { transform: rotate(180deg); background: rgba(0,0,0,0.1); color: var(--sys-color-on-surface); }

/* STAT POD (Slimmed) */
.stat-pod {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  width: 42px; height: 42px; 
  border-radius: 12px; 
  background: var(--sys-color-surface-container-highest);
  color: var(--sys-color-on-surface-variant);
  flex-shrink: 0;
  transition: background 0.3s;
  border: 1px solid rgba(255,255,255,0.05);
}
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
  font-size: 15px; 
  font-weight: 800; 
  line-height: 1; 
  letter-spacing: -0.5px; 
  font-family: var(--sys-font-family-mono); 
}
.stat-sub { 
  font-size: 6px; 
  font-weight: 800; 
  opacity: 0.8; 
  margin-top: 1px; 
  text-transform: uppercase; 
  letter-spacing: 0.5px; 
}

/* BODY */
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
  margin-top: 12px;
  padding-top: 12px;
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
  background: var(--sys-color-surface-container); 
  padding: 8px 6px; 
  border-radius: 10px; 
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
</style>
