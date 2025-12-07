<script setup lang="ts">
import type { LeaderboardMember } from '../types'
import WarHistoryChart from './WarHistoryChart.vue'

const props = defineProps<{
  member: LeaderboardMember
  rank: number
  expanded: boolean
}>()

const emit = defineEmits<{
  toggle: []
}>()

function getRoleBadgeClass(role: string): string {
  const r = role.toLowerCase()
  if (r === 'leader') return 'badge-leader'
  if (r === 'co-leader' || r === 'coleader') return 'badge-co-leader'
  if (r === 'elder') return 'badge-elder'
  return 'badge-member'
}

function formatRole(role: string): string {
  const r = role.toLowerCase()
  if (r === 'coleader') return 'Co-Leader'
  return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase()
}

function formatScore(score: number): string {
  if (score >= 10000) return `${(score / 1000).toFixed(1)}k`
  return score.toLocaleString()
}

// Tonal color class based on score
function getScoreTone(score: number): string {
  if (score >= 80) return 'tone-high'
  if (score >= 50) return 'tone-mid'
  return 'tone-low'
}

function openInGame() {
  window.open(`clashroyale://playerInfo?id=${props.member.id}`, '_blank')
}

function openRoyaleAPI() {
  window.open(`https://royaleapi.com/player/${props.member.id}`, '_blank')
}
</script>

<template>
  <div 
    class="member-card"
    :class="{ 'member-card-expanded': expanded }"
    @click="emit('toggle')"
  >
    <!-- Main Row -->
    <div class="card-header">
      <!-- Rank Badge -->
      <div class="rank" :class="{ 'rank-top': rank <= 3 }">
        <span v-if="rank === 1">🥇</span>
        <span v-else-if="rank === 2">🥈</span>
        <span v-else-if="rank === 3">🥉</span>
        <span v-else>{{ rank }}</span>
      </div>
      
      <!-- Member Info -->
      <div class="member-info">
        <div class="member-header">
          <span class="member-name">{{ member.n }}</span>
          <span 
            v-if="member.d.role && member.d.role.toLowerCase() !== 'member'"
            class="badge" 
            :class="getRoleBadgeClass(member.d.role)"
          >
            {{ formatRole(member.d.role) }}
          </span>
        </div>
        
        <div class="member-stats">
          <span class="stat-item">
            <span class="stat-icon">🏆</span>
            {{ member.t.toLocaleString() }}
          </span>
          <span class="stat-item">
            <span class="stat-icon">⚔️</span>
            {{ member.d.rate }}
          </span>
          <span class="stat-item" v-if="member.d.days > 0">
            <span class="stat-icon">📅</span>
            {{ member.d.days }}d
          </span>
        </div>
      </div>
      
      <!-- Score Pod + Chevron -->
      <div class="action-area">
        <div class="stat-pod" :class="getScoreTone(member.s)">
          <span class="stat-score">{{ Math.round(member.s) }}</span>
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
          <span class="stat-box-label">Avg/Day</span>
          <span class="stat-box-value">{{ member.d.avg }}</span>
        </div>
        <div class="stat-box">
          <span class="stat-box-label">War Rate</span>
          <span class="stat-box-value">{{ member.d.rate }}</span>
        </div>
        <div class="stat-box">
          <span class="stat-box-label">Last Seen</span>
          <span class="stat-box-value">{{ member.d.seen }}</span>
        </div>
      </div>
      
      <!-- War History Chart -->
      <WarHistoryChart :history="member.d.hist" />
      
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
.member-card {
  background: var(--md-sys-color-surface-container, #f3f3f3);
  border-radius: 1.25rem;
  padding: 1rem;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.2, 0, 0, 1);
  border: 1px solid transparent;
}

.member-card:active {
  transform: scale(0.98);
}

.member-card-expanded {
  background: var(--md-sys-color-surface-container-high, #e8e8e8);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.08);
}

/* Header Layout */
.card-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

/* Rank */
.rank {
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--md-sys-color-surface-variant, #e0e0e0);
  border-radius: 50%;
  font-weight: 700;
  font-size: 0.875rem;
  color: var(--md-sys-color-on-surface-variant, #49454f);
  flex-shrink: 0;
}

.rank-top {
  background: transparent;
  font-size: 1.5rem;
}

/* Member Info */
.member-info {
  flex: 1;
  min-width: 0;
}

.member-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
}

.member-name {
  font-weight: 600;
  font-size: 1rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--md-sys-color-on-surface, #1c1b1f);
}

/* Role Badges */
.badge {
  font-size: 0.625rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 0.25rem 0.5rem;
  border-radius: 0.5rem;
}

.badge-leader {
  background: var(--md-sys-color-primary-container, #eaddff);
  color: var(--md-sys-color-on-primary-container, #21005e);
}

.badge-co-leader {
  background: var(--md-sys-color-secondary-container, #e8def8);
  color: var(--md-sys-color-on-secondary-container, #1e192b);
}

.badge-elder {
  background: var(--md-sys-color-tertiary-container, #ffd8e4);
  color: var(--md-sys-color-on-tertiary-container, #31111d);
}

.badge-member {
  display: none;
}

/* Stats Row */
.member-stats {
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
  font-family: system-ui, sans-serif;
}

.stat-sub {
  font-size: 0.5rem;
  font-weight: 700;
  opacity: 0.7;
  margin-top: 2px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
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
  max-height: 400px;
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
  margin-top: 1rem;
}

.btn-action {
  flex: 1;
  padding: 0.875rem 1rem;
  border: none;
  border-radius: 1.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s ease, opacity 0.15s ease;
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
