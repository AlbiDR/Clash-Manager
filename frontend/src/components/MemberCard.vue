<script setup lang="ts">
import { defineProps } from 'vue'
import type { LeaderboardMember } from '../types'

defineProps<{
  member: LeaderboardMember
  rank: number
}>()

function getRoleBadgeClass(role: string): string {
  switch (role.toLowerCase()) {
    case 'leader': return 'badge-leader'
    case 'co-leader': return 'badge-co-leader'
    case 'elder': return 'badge-elder'
    default: return 'badge-member'
  }
}

function formatScore(score: number): string {
  if (score >= 10000) return `${(score / 1000).toFixed(1)}k`
  return score.toLocaleString()
}
</script>

<template>
  <div class="member-card glass-card">
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
        <span class="badge" :class="getRoleBadgeClass(member.d.role)">
          {{ member.d.role }}
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
    
    <!-- Score -->
    <div class="score-container">
      <span class="score">{{ formatScore(member.s) }}</span>
      <span class="score-label">pts</span>
    </div>
  </div>
</template>

<style scoped>
.member-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.875rem 1rem;
}

/* Rank */
.rank {
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--cr-bg-tertiary);
  border-radius: 50%;
  font-weight: 700;
  font-size: 0.875rem;
  color: var(--cr-text-secondary);
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
  font-size: 0.9375rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

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
  color: var(--cr-text-secondary);
}

.stat-icon {
  font-size: 0.625rem;
}

/* Score */
.score-container {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  flex-shrink: 0;
}

.score {
  font-size: 1.25rem;
  font-weight: 700;
  background: var(--cr-gradient-primary);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.score-label {
  font-size: 0.625rem;
  color: var(--cr-text-muted);
  text-transform: uppercase;
}
</style>
