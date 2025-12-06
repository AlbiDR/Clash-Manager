<script setup lang="ts">
import { defineProps, defineEmits, computed } from 'vue'
import type { Recruit } from '../types'

const props = defineProps<{
  recruit: Recruit
  selected: boolean
}>()

const emit = defineEmits<{
  toggle: []
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

function formatScore(score: number): string {
  if (score >= 10000) return `${(score / 1000).toFixed(1)}k`
  return score.toLocaleString()
}

function openProfile() {
  window.open(`https://royaleapi.com/player/${props.recruit.id}`, '_blank')
}
</script>

<template>
  <div 
    class="recruit-card glass-card"
    :class="{ 'recruit-selected': selected }"
    @click="emit('toggle')"
  >
    <!-- Selection Checkbox -->
    <div class="checkbox" :class="{ 'checkbox-checked': selected }">
      <span v-if="selected">✓</span>
    </div>
    
    <!-- Main Content -->
    <div class="recruit-content">
      <div class="recruit-header">
        <span class="recruit-name">{{ recruit.n }}</span>
        <span class="recruit-score">{{ formatScore(recruit.s) }} pts</span>
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
      
      <div class="recruit-footer">
        <span class="found-time">Found {{ timeAgo }}</span>
        <button class="profile-btn" @click.stop="openProfile">
          View Profile →
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.recruit-card {
  display: flex;
  gap: 0.75rem;
  padding: 1rem;
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
}

.recruit-selected {
  border-color: var(--cr-primary);
  background: rgba(99, 102, 241, 0.15);
}

/* Checkbox */
.checkbox {
  width: 1.5rem;
  height: 1.5rem;
  border: 2px solid var(--cr-bg-tertiary);
  border-radius: 0.375rem;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.2s ease;
  font-size: 0.75rem;
  color: white;
}

.checkbox-checked {
  background: var(--cr-primary);
  border-color: var(--cr-primary);
}

/* Content */
.recruit-content {
  flex: 1;
  min-width: 0;
}

.recruit-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.recruit-name {
  font-weight: 600;
  font-size: 0.9375rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.recruit-score {
  font-size: 0.875rem;
  font-weight: 700;
  background: var(--cr-gradient-primary);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  flex-shrink: 0;
}

.recruit-stats {
  display: flex;
  gap: 1rem;
  margin-bottom: 0.75rem;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.8125rem;
  color: var(--cr-text-secondary);
}

.stat-icon {
  font-size: 0.75rem;
}

.recruit-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.found-time {
  font-size: 0.75rem;
  color: var(--cr-text-muted);
}

.profile-btn {
  background: none;
  border: none;
  color: var(--cr-primary-light);
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  transition: all 0.2s;
}

.profile-btn:hover {
  background: rgba(99, 102, 241, 0.2);
}
</style>
