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
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  return h > 24 ? Math.floor(h / 24) + 'd' : h + 'h'
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
    text: `Potential recruit: ${props.recruit.n} (#${props.recruit.id})`,
    url: `https://royaleapi.com/player/${props.recruit.id}`
  })
}

function handleClick(e: Event) {
  if (isLongPress.value) { isLongPress.value = false; return }
  if ((e.target as HTMLElement).closest('.btn-action') || (e.target as HTMLElement).closest('a') || (e.target as HTMLElement).closest('.btn-icon-action')) return
  if (props.selectionMode) emit('toggle-select')
  else emit('toggle-expand')
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
          <div class="badge time">{{ timeAgo }}</div>
          <div class="badge tag">#{{ recruit.id }}</div>
        </div>
        
        <!-- Name and Trophies -->
        <div class="name-block">
          <span class="player-name">{{ recruit.n }}</span>
          <div class="trophy-meta">
            <Icon name="trophy" size="12" />
            <span class="trophy-val">{{ (recruit.t || 0).toLocaleString() }}</span>
          </div>
        </div>
      </div>

      <div class="score-section">
        <div class="stat-pod" :class="toneClass">
          <span class="stat-score">{{ Math.round(recruit.s || 0) }}</span>
        </div>
      </div>
    </div>

    <div class="card-body" v-if="expanded">
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
  position: relative;
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
.badge.tag { color: var(--sys-color-outline); font-size: 8px; opacity: 0.8; }

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
  width: 48px; height: 48px;
  background: var(--sys-color-surface-container-highest);
  border-radius: 14px;
  display: flex; align-items: center; justify-content: center;
  font-size: 18px; font-weight: 900;
  font-family: var(--sys-font-family-mono);
}

.stat-pod.tone-high { background: var(--sys-color-primary); color: var(--sys-color-on-primary); }
.stat-pod.tone-mid { background: var(--sys-color-secondary-container); color: var(--sys-color-on-secondary-container); }

.card-body { margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(0,0,0,0.05); }

.stats-row { display: flex; justify-content: space-between; padding: 0 4px; margin-bottom: 12px; }
.stat-cell { flex: 1; display: flex; flex-direction: column; align-items: center; }
.stat-cell.border-l { border-left: 1px solid rgba(0,0,0,0.05); }
.sc-label { font-size: 10px; text-transform: uppercase; color: var(--sys-color-outline); font-weight: 800; margin-bottom: 2px; }
.sc-val { font-size: 14px; font-weight: 800; color: var(--sys-color-on-surface); font-family: var(--sys-font-family-mono); }

.actions-toolbar { display: flex; gap: 8px; margin-top: 8px; }
.btn-action { flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px; height: 44px; border-radius: 12px; font-size: 13px; font-weight: 700; text-decoration: none; }
.btn-action.primary { background: var(--sys-color-primary); color: var(--sys-color-on-primary); }
.btn-action.secondary { background: var(--sys-color-surface-container-highest); color: var(--sys-color-on-surface); }
.btn-icon-action { width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; background: var(--sys-color-surface-container-highest); color: var(--sys-color-primary); border: none; border-radius: 12px; cursor: pointer; }
</style>
