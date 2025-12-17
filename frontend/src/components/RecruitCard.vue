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

const toneClass = computed(() => {
  const score = props.recruit.s || 0
  if (score >= 80) return 'tone-high'
  if (score >= 50) return 'tone-mid'
  return 'tone-low'
})

const timeAgo = computed(() => {
  const dateStr = props.recruit.d.ago
  if (!dateStr) return '-'
  const ts = new Date(dateStr).getTime()
  const m = Math.floor((Date.now() - ts) / 60000)
  if (m < 1) return 'New' 
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  return h > 24 ? Math.floor(h / 24) + 'd ago' : h + 'h ago'
})

// Composables
import { useLongPress } from '../composables/useLongPress'
import { useShare } from '../composables/useShare'

const { isLongPress, start: startPress, cancel: cancelPress } = useLongPress(() => {
  if (navigator.vibrate) navigator.vibrate(15) // Sharp tick
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
    class="card squish-interaction"
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
        <span class="tenure-badge">{{ timeAgo }}</span>
        <span class="player-name">{{ recruit.n }}</span>
        <span class="role-badge tag-badge">#{{ recruit.id }}</span>
        <span class="meta-val trophy-val">
          <Icon name="trophy" size="12" style="color:#fbbf24;" />
          <span class="trophy-text">{{ (recruit.t || 0).toLocaleString() }}</span>
        </span>
      </div>

      <div class="action-area">
        <div class="stat-pod" :class="toneClass">
          <div class="stat-score">{{ Math.round(recruit.s || 0) }}</div>
        </div>
        <div class="chevron-btn">
          <Icon name="chevron_down" size="18" />
        </div>
      </div>
    </div>

    <!-- Body -->
    <div class="card-body">
      <div class="body-inner">
        <div class="stats-row">
          <div class="stat-cell">
            <span class="sc-label">Donations</span>
            <span class="sc-val">{{ recruit.d.don }}</span>
          </div>
          <div class="stat-cell border-l">
            <span class="sc-label">War Wins</span>
            <span class="sc-val">{{ recruit.d.war }}</span>
          </div>
          <div class="stat-cell border-l">
            <span class="sc-label">Cards Won</span>
            <span class="sc-val">{{ recruit.d.cards || '-' }}</span>
          </div>
        </div>

        <div class="actions-toolbar">
          <a :href="`https://royaleapi.com/player/${recruit.id}`" target="_blank" class="btn-action secondary compact">
            <Icon name="analytics" size="14" />
            <span>RoyaleAPI</span>
          </a>
          <a :href="`clashroyale://playerInfo?id=${recruit.id}`" class="btn-action primary compact">
            <Icon name="crown" size="14" />
            <span>Open Game</span>
          </a>
          <button v-if="canShare" class="btn-icon-action" @click.stop="shareRecruit">
            <Icon name="share" size="16" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.card {
  background: var(--sys-color-surface-container);
  border-radius: 16px;
  padding: 8px 12px;
  margin-bottom: 6px;
  position: relative; overflow: hidden;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  border: 1px solid rgba(255,255,255,0.03);
  /* 🔋 RAM SAVER: Box-shadow removed on static state */
  box-shadow: none;
  backface-visibility: hidden;
}

.card.expanded { 
  background: var(--sys-color-surface-container-high);
  box-shadow: 0 4px 16px rgba(0,0,0,0.15), 0 0 0 1px rgba(var(--sys-color-primary-rgb), 0.1) inset;
  border-color: rgba(var(--sys-color-primary-rgb), 0.3);
  z-index: 10;
  margin: 12px 0;
  transform: scale(1.02);
  will-change: transform;
}

.card.selected { background: var(--sys-color-secondary-container); }

.selection-indicator {
  position: absolute; left: 0; top: 0; bottom: 0; width: 4px;
  background: var(--sys-color-primary); opacity: 0; transition: opacity 0.2s;
}
.card.selected .selection-indicator { opacity: 1; }

.card-header { display: flex; justify-content: space-between; align-items: center; height: 40px; }
.info-stack { display: grid; grid-template-columns: max-content 1fr; grid-template-rows: 1fr 1fr; gap: 4px 8px; align-items: center; flex: 1; min-width: 0; }
.player-name { font-size: 15px; font-weight: 750; color: var(--sys-color-on-surface); letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.meta-val { font-size: 12px; font-weight: 500; color: var(--sys-color-outline); line-height: 1.2; }
.trophy-val { display: flex; align-items: center; }
.action-area { display: flex; align-items: center; gap: 10px; height: 100%; }

.tenure-badge {
  display: flex; align-items: center; justify-content: center;
  height: 20px; width: 75px; border-radius: 6px;
  background: var(--sys-color-surface-container-highest);
  color: var(--sys-color-outline);
  font-size: 11px; font-weight: 700; font-family: var(--sys-font-family-mono);
}

.role-badge { display: inline-block; width: 75px; text-align: center; font-size: 9.5px; font-weight: 700; text-transform: uppercase; padding: 3px 8px; border-radius: 6px; border: 1px solid transparent; }
.tag-badge { font-family: var(--sys-font-family-mono); font-size: 10.5px; text-transform: none; background: var(--sys-color-surface-container-high); color: var(--sys-color-on-surface-variant); border: 1px solid rgba(255,255,255,0.05); }

.stat-pod {
  display: flex; align-items: center; justify-content: center;
  width: 45px; height: 45px; border-radius: 12px;
  background: var(--sys-color-surface-container-highest);
  color: var(--sys-color-on-surface-variant);
  font-weight: 800; font-size: 14px;
  font-family: var(--sys-font-family-mono);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.1);
  border: 1px solid rgba(255,255,255,0.05);
}

.stat-pod.tone-high { background: linear-gradient(135deg, var(--sys-color-primary-container), var(--sys-color-primary)); color: var(--sys-color-on-primary); border: none; }
.stat-pod.tone-mid { background: linear-gradient(135deg, var(--sys-color-secondary-container), var(--sys-color-secondary)); color: var(--sys-color-on-secondary); border: none; }

.chevron-btn { color: var(--sys-color-outline); transition: transform 0.3s; }
.card.expanded .chevron-btn { transform: rotate(180deg); color: var(--sys-color-primary); }

.card-body {
  display: grid; grid-template-rows: 0fr;
  transition: grid-template-rows 0.4s var(--sys-motion-spring), margin-top 0.4s var(--sys-motion-spring);
  margin-top: 0; padding-top: 0; pointer-events: none;
}
.body-inner { min-height: 0; overflow: hidden; opacity: 0; transition: opacity 0.2s ease; }
.card.expanded .card-body { grid-template-rows: 1fr; margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.05); pointer-events: auto; }
.card.expanded .body-inner { opacity: 1; transition-delay: 0.1s; }

.stats-row { display: flex; justify-content: space-between; padding: 0 4px; margin-bottom: 4px; }
.stat-cell { flex: 1; display: flex; flex-direction: column; align-items: center; }
.stat-cell.border-l { border-left: 1px solid rgba(255,255,255,0.05); }
.sc-label { font-size: 10px; text-transform: uppercase; color: var(--sys-color-outline); font-weight: 700; margin-bottom: 2px; }
.sc-val { font-size: 14px; font-weight: 700; color: var(--sys-color-on-surface); font-family: var(--sys-font-family-mono); }

.actions-toolbar { display: flex; gap: 8px; margin-top: 8px; }
.btn-action { flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; height: 36px; border-radius: 10px; font-size: 12px; font-weight: 700; text-decoration: none; }
.btn-action.primary { background: linear-gradient(135deg, var(--sys-color-primary), #00508a); color: white; }
.btn-action.secondary { background: var(--sys-color-surface-container); color: var(--sys-color-on-surface); border: 1px solid rgba(255,255,255,0.05); }
.btn-icon-action { width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; background: transparent; border: 1px solid rgba(255,255,255,0.1); color: var(--sys-color-primary); border-radius: 10px; cursor: pointer; }
</style>
