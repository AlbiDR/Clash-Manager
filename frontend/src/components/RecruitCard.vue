<script setup lang="ts">
import { computed } from 'vue'
import type { Recruit } from '../types'

const props = defineProps<{
  recruit: Recruit
  selected: boolean
  expanded: boolean
  selectionMode: boolean
}>()

const emit = defineEmits<{
  toggleSelect: []
  toggleExpand: []
}>()

// Calculate how long ago the recruit was found
const timeAgo = computed(() => {
  if (!props.recruit.d.ago) return 'Unknown'
  
  const found = new Date(props.recruit.d.ago)
  const now = new Date()
  const diffMs = now.getTime() - found.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  return `${Math.floor(diffDays / 7)}w ago`
})

// Tonal color class based on score
function getScoreTone(score: number): string {
  if (score >= 80) return 'tone-high'
  if (score >= 50) return 'tone-mid'
  return 'tone-low'
}

function handleClick() {
  if (props.selectionMode) {
    emit('toggleSelect')
  } else {
    emit('toggleExpand')
  }
}

function openInGame() {
  window.open(`clashroyale://playerInfo?id=${props.recruit.id}`, '_blank')
}

function openRoyaleAPI() {
  window.open(`https://royaleapi.com/player/${props.recruit.id}`, '_blank')
}
</script>

<template>
  <div 
    class="recruit-card"
    :class="{ 
      'recruit-card-selected': selected,
      'recruit-card-expanded': expanded
    }"
    @click="handleClick"
  >
    <!-- Selection Indicator -->
    <div v-if="selectionMode" class="selection-indicator" :class="{ active: selected }">
      <span v-if="selected">✓</span>
    </div>
    
    <!-- Main Row -->
    <div class="card-header">
      <!-- Member Info -->
      <div class="recruit-info">
        <div class="recruit-header">
          <span class="recruit-name">{{ recruit.n }}</span>
        </div>
        
        <div class="recruit-stats">
          <span class="stat-item">
            <span class="stat-icon">🏆</span>
            {{ recruit.t.toLocaleString() }}
          </span>
          <span class="stat-item">
            <span class="stat-icon">🎁</span>
            {{ recruit.d.don.toLocaleString() }}
          </span>
          <span class="stat-item">
            <span class="stat-icon">⚔️</span>
            {{ recruit.d.war }}
          </span>
        </div>
      </div>
      
      <!-- Score Pod + Chevron -->
      <div class="action-area">
        <div class="stat-pod" :class="getScoreTone(recruit.s)">
          <span class="stat-score">{{ Math.round(recruit.s) }}</span>
          <span class="stat-sub">SCORE</span>
        </div>
        <div class="chevron-btn" :class="{ 'chevron-open': expanded }">
          <svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
      </div>
    </div>
    
    <!-- Expanded Details -->
    <div class="card-body" :class="{ 'card-body-open': expanded }">
      <!-- Grid Stats -->
      <div class="grid-stats">
        <div class="stat-box">
          <span class="stat-box-label">Found</span>
          <span class="stat-box-value">{{ timeAgo }}</span>
        </div>
        <div class="stat-box">
          <span class="stat-box-label">Cards Won</span>
          <span class="stat-box-value">{{ recruit.d.cards || '-' }}</span>
        </div>
        <div class="stat-box">
          <span class="stat-box-label">War Wins</span>
          <span class="stat-box-value">{{ recruit.d.war }}</span>
        </div>
      </div>
      
      <!-- Action Buttons -->
      <div class="btn-row">
        <button class="btn-action btn-secondary" @click.stop="openRoyaleAPI">
          RoyaleAPI
        </button>
        <button class="btn-action btn-primary" @click.stop="openInGame">
          Open in Game
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.recruit-card {
  background: var(--md-sys-color-surface-container, #f3f3f3);
  border-radius: 1.25rem;
  padding: 1rem;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.2, 0, 0, 1);
  display: flex;
  flex-direction: column;
  position: relative;
}

.recruit-card:active {
  transform: scale(0.98);
}

.recruit-card-selected {
  background: var(--md-sys-color-secondary-container, #e8def8);
}

.recruit-card-expanded {
  background: var(--md-sys-color-surface-container-high, #e8e8e8);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.08);
}

/* Selection Indicator */
.selection-indicator {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  width: 1.5rem;
  height: 1.5rem;
  border: 2px solid var(--md-sys-color-outline, #79747e);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  color: white;
  transition: all 0.2s ease;
}

.selection-indicator.active {
  background: var(--md-sys-color-primary, #6750a4);
  border-color: var(--md-sys-color-primary, #6750a4);
}

/* Header Layout */
.card-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

/* Recruit Info */
.recruit-info {
  flex: 1;
  min-width: 0;
}

.recruit-header {
  margin-bottom: 0.25rem;
}

.recruit-name {
  font-weight: 600;
  font-size: 1rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--md-sys-color-on-surface, #1c1b1f);
}

/* Stats Row */
.recruit-stats {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  color: var(--md-sys-color-outline, #79747e);
}

.stat-icon {
  font-size: 0.625rem;
}

/* Action Area */
.action-area {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

/* Score Pod */
.stat-pod {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 3.5rem;
  height: 3.5rem;
  border-radius: 1rem;
  flex-shrink: 0;
}

.tone-high {
  background: var(--md-sys-color-primary-container, #eaddff);
  color: var(--md-sys-color-on-primary-container, #21005e);
}

.tone-mid {
  background: var(--md-sys-color-secondary-container, #e8def8);
  color: var(--md-sys-color-on-secondary-container, #1e192b);
}

.tone-low {
  background: var(--md-sys-color-surface-variant, #e7e0ec);
  color: var(--md-sys-color-on-surface-variant, #49454f);
}

.stat-score {
  font-size: 1.125rem;
  font-weight: 700;
  line-height: 1;
}

.stat-sub {
  font-size: 0.5rem;
  font-weight: 700;
  opacity: 0.7;
  margin-top: 2px;
  text-transform: uppercase;
}

/* Chevron */
.chevron-btn {
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--md-sys-color-on-surface-variant, #49454f);
  opacity: 0.5;
  transition: transform 0.3s cubic-bezier(0.2, 0, 0, 1);
}

.chevron-btn svg {
  width: 1.25rem;
  height: 1.25rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.chevron-open {
  transform: rotate(180deg);
  opacity: 1;
}

/* Expanded Body */
.card-body {
  max-height: 0;
  opacity: 0;
  overflow: hidden;
  transition: all 0.3s cubic-bezier(0.2, 0, 0, 1);
}

.card-body-open {
  max-height: 300px;
  opacity: 1;
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--md-sys-color-outline-variant, #cac4d0);
}

/* Grid Stats */
.grid-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.stat-box {
  background: var(--md-sys-color-surface-container, #f3f3f3);
  padding: 0.75rem 0.5rem;
  border-radius: 0.75rem;
  text-align: center;
}

.stat-box-label {
  display: block;
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--md-sys-color-outline, #79747e);
  margin-bottom: 0.25rem;
}

.stat-box-value {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--md-sys-color-on-surface, #1c1b1f);
}

/* Action Buttons */
.btn-row {
  display: flex;
  gap: 0.75rem;
}

.btn-action {
  flex: 1;
  padding: 0.875rem 1rem;
  border: none;
  border-radius: 1.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s ease;
}

.btn-action:active {
  transform: scale(0.97);
}

.btn-primary {
  background: var(--md-sys-color-primary, #6750a4);
  color: var(--md-sys-color-on-primary, #ffffff);
}

.btn-secondary {
  background: var(--md-sys-color-secondary-container, #e8def8);
  color: var(--md-sys-color-on-secondary-container, #1e192b);
}
</style>
