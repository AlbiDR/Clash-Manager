
<script setup lang="ts">
import { computed } from 'vue'
import type { Recruit } from '../types'
import Icon from './Icon.vue'
import { useBenchmarking } from '../composables/useBenchmarking'
import { useModules } from '../composables/useModules'
import { useCardMechanics } from '../composables/useCardMechanics'
import { getScoreTone, formatTimeAgoShort } from '../utils/formatters'

const props = defineProps<{
  id: string
  recruit: Recruit
  expanded: boolean
  selected: boolean
  selectionMode: boolean
  appIsRefreshing?: boolean // New prop
}>()

const emit = defineEmits<{
  'toggle-expand': []
  'toggle-select': []
}>()

const { getBenchmark } = useBenchmarking()
const { modules } = useModules()

// Reusable card interactions with specific callbacks
const { handleTap, handleLongPress, handleScoreClick, handleExpandClick } = useCardMechanics(
    props,
    {
        onExpand: () => emit('toggle-expand'),
        onSelect: () => emit('toggle-select')
    }
)

function getTooltip(metric: string, value: number | undefined) {
  if (!modules.value.ghostBenchmarking || value === undefined) return null
  return getBenchmark('hh', metric, value)
}

const toneClass = computed(() => getScoreTone(props.recruit.s))
const timeAgo = computed(() => formatTimeAgoShort(props.recruit.d.ago))
</script>

<template>
  <div 
    class="card squish-interaction"
    :class="{ 'expanded': expanded, 'selected': selected }"
    v-tactile="{ onTap: handleTap, onLongPress: handleLongPress }"
  >
    <div class="card-header">
      <div class="identity-group">
        <div class="meta-stack">
          <div class="badge time">{{ timeAgo }}</div>
          <div class="badge tag">#{{ recruit.id.substring(0, 5) }}</div>
        </div>
        
        <div class="name-block">
          <span class="player-name">{{ recruit.n }}</span>
          <div 
            class="trophy-meta hit-target" 
            v-tooltip="getTooltip('trophies', recruit.t)"
          >
            <Icon name="trophy" size="12" />
            <span class="trophy-val">{{ (recruit.t || 0).toLocaleString() }}</span>
          </div>
        </div>
      </div>

      <div class="header-actions">
        <div class="score-section" @click.stop="handleScoreClick">
          <div 
            class="stat-pod hit-target" 
            :class="toneClass" 
            v-tooltip="getTooltip('score', recruit.s)"
          >
            <span class="stat-score">{{ Math.round(recruit.s || 0) }}</span>
          </div>
        </div>
        <button 
          class="expand-btn hit-target" 
          @click.stop="handleExpandClick" 
          :class="{ 'is-active': expanded }"
          aria-label="Expand details"
        >
          <Icon name="chevron_down" size="20" />
        </button>
      </div>
    </div>

    <div class="card-body" v-if="expanded">
      <div class="stats-row" :aria-busy="appIsRefreshing ? 'true' : 'false'">
        <template v-if="appIsRefreshing">
          <div v-for="i in 3" :key="i" class="stat-cell skeleton-anim">
            <div class="sk-text-line-s" :style="{ width: `${50 + (i * 5)}px` }"></div>
            <div class="sk-stat-value" :style="{ width: `${40 + (i * 5)}px` }"></div>
          </div>
        </template>
        <template v-else>
          <div class="stat-cell hit-target" v-tooltip="getTooltip('donations', recruit.d.don)">
            <span class="sc-label">Donations</span>
            <span class="sc-val">{{ recruit.d.don }}</span>
          </div>
          <div class="stat-cell border-l hit-target" v-tooltip="getTooltip('warWins', recruit.d.war)">
            <span class="sc-label">War Wins</span>
            <span class="sc-val">{{ recruit.d.war }}</span>
          </div>
          <div class="stat-cell border-l hit-target" v-tooltip="getTooltip('cardsWon', recruit.d.cards)">
            <span class="sc-label">Cards Won</span>
            <span class="sc-val">{{ recruit.d.cards || '-' }}</span>
          </div>
        </template>
      </div>

      <div class="actions-toolbar">
        <template v-if="appIsRefreshing">
          <div class="sk-button-m skeleton-anim" style="flex: 1;"></div>
          <div class="sk-button-m skeleton-anim" style="flex: 1;"></div>
        </template>
        <template v-else>
          <a :href="`https://royaleapi.com/player/${recruit.id}`" target="_blank" class="btn-action compact">
            <Icon name="analytics" size="14" />
            <span>RoyaleAPI</span>
          </a>
          <a :href="`clashroyale://playerInfo?id=${recruit.id}`" class="btn-action primary compact">
            <Icon name="crown" size="14" />
            <span>Open Game</span>
          </a>
        </template>
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
  touch-action: pan-y; 
  /* ⚡ OPTIMIZED: Removed 'all', strictly animates composited properties + colors */
  transition: transform 0.2s var(--sys-motion-spring), background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
  will-change: transform;
  
  /* ⚡ PERFORMANCE */
  contain: layout paint style;
  contain-intrinsic-size: auto 75px; 
  content-visibility: auto;
}

.card.expanded { 
  background: var(--sys-color-surface-container-high); 
  box-shadow: var(--sys-elevation-3); 
  margin: 16px 0; 
  border-color: rgba(var(--sys-color-primary-rgb), 0.3); 
  content-visibility: visible;
  contain: none;
  contain-intrinsic-size: auto 200px; 
}

.card.selected { background: var(--sys-color-primary-container) !important; border: 2.5px solid var(--sys-color-primary); transform: scale(0.97); }
.card.selected .player-name, .card.selected .trophy-val, .card.selected .stat-score, .card.selected .sc-label, .card.selected .sc-val, .card.selected .expand-btn { color: var(--sys-color-on-primary-container) !important; opacity: 1 !important; }
.card.selected .stat-pod { background: rgba(var(--sys-color-on-primary-container-rgb, 0,29,54), 0.12) !important; color: var(--sys-color-on-primary-container) !important; border: 1px solid rgba(var(--sys-color-on-primary-container-rgb), 0.1); }
.card.selected .badge { background: rgba(var(--sys-color-on-primary-container-rgb, 0,29,54), 0.1) !important; color: var(--sys-color-on-primary-container) !important; }
.card-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.identity-group { display: flex; align-items: center; gap: 14px; flex: 1; min-width: 0; }
.meta-stack { display: flex; flex-direction: column; gap: 4px; width: 60px; flex-shrink: 0; }
.badge { height: 18px; width: 100%; background: var(--sys-color-surface-container-highest); border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 800; color: var(--sys-color-on-surface); font-family: var(--sys-font-family-mono); text-transform: uppercase; }
.hit-target { position: relative; z-index: 5; }
.hit-target::after { content: ''; position: absolute; inset: -4px; }
.name-block { display: flex; flex-direction: column; min-width: 0; }
.player-name { font-size: 16px; font-weight: 850; color: var(--sys-color-on-surface); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; letter-spacing: -0.02em; line-height: 1.1; }
/* Darkened Trophy Color for contrast */
.trophy-meta { display: flex; align-items: center; gap: 4px; color: #854d0e; margin-top: 2px; width: fit-content; }
:root.dark .trophy-meta { color: #fbbf24; }
.trophy-val { font-size: 13px; font-weight: 700; font-family: var(--sys-font-family-mono); }
.header-actions { display: flex; align-items: center; gap: 4px; }
.expand-btn { background: none; border: none; padding: 8px; color: var(--sys-color-outline); cursor: pointer; transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
.expand-btn.is-active { transform: rotate(180deg); color: var(--sys-color-primary); }
.stat-pod { width: 48px; height: 48px; background: var(--sys-color-surface-container-highest); border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 900; font-family: var(--sys-font-family-mono); transition: transform 0.2s; }
.stat-pod:hover { transform: scale(1.05); }
.stat-pod.tone-high { background: var(--sys-color-primary); color: var(--sys-color-on-primary); }
.stat-pod.tone-mid { background: var(--sys-color-secondary-container); color: var(--sys-color-on-secondary-container); }
.card-body { margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(0,0,0,0.05); animation: fade-in 0.3s ease; }
@keyframes fade-in { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
.stats-row { display: flex; justify-content: space-between; padding: 0 4px; margin-bottom: 12px; }
.stat-cell { flex: 1; display: flex; flex-direction: column; align-items: center; padding: 4px; border-radius: 8px; transition: background 0.2s; }
.stat-cell.border-l { border-left: 1px solid rgba(0,0,0,0.05); }
.sc-label { font-size: 10px; text-transform: uppercase; color: var(--sys-color-secondary); font-weight: 800; margin-bottom: 2px; }
.sc-val { font-size: 14px; font-weight: 800; color: var(--sys-color-on-surface); font-family: var(--sys-font-family-mono); }
.actions-toolbar { display: flex; gap: 8px; margin-top: 8px; }
.btn-action { flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px; height: 44px; border-radius: 12px; font-size: 13px; font-weight: 700; text-decoration: none; border: none; cursor: pointer; }
.btn-action.primary { background: var(--sys-color-primary); color: var(--sys-color-on-primary); }
.btn-action.secondary { background: var(--sys-color-surface-container-highest); color: var(--sys-color-on-surface); }
</style>
