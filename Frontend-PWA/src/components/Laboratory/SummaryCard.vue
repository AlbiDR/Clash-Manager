<script setup lang="ts">
import { type OptimizationResult, type PlayerProfile } from "../../logic/Laboratory/Laboratory_Types";
import Icon from "../Icon.vue";

const props = defineProps<{
  result: OptimizationResult;
  profile: PlayerProfile;
}>();

const formatNumber = (num: number) => {
  return new Intl.NumberFormat().format(num);
};

const baseUrl = import.meta.env.BASE_URL;
</script>

<template>
  <div class="summary-card glass-panel">
    <div class="summary-header">
      <div class="player-info">
        <h2 class="player-name">{{ profile.name }}</h2>
        <span class="player-tag">#{{ profile.tag }}</span>
      </div>
      <div class="projection-badge">
        <span class="label">Trajectory</span>
        <span class="value">{{ result.actions.length }} Steps</span>
      </div>
    </div>

    <div class="metrics-grid">
      <!-- Row 1: King Level Focus -->
      <div class="metric-item main">
        <label class="metric-label">Target Level</label>
        <div class="king-level-display">
          <div class="level-badge current">
            <span class="num">{{ profile.kingLevel }}</span>
            <img :src="`${baseUrl}assets/game/tower_level.webp`" class="level-icon" alt="Tower" />
          </div>
          <Icon name="chevron_right" size="18" class="progression-arrow" />
          <div class="level-badge target">
            <span class="num">{{ result.projectedKingLevel }}</span>
            <img :src="`${baseUrl}assets/game/tower_level.webp`" class="level-icon" alt="Tower" />
          </div>
        </div>
      </div>

      <div class="metric-item">
        <label class="metric-label">Experience Required</label>
        <div class="resource-group xp">
          <span class="value">{{ formatNumber(result.totalXpGained) }}</span>
          <img :src="`${baseUrl}assets/game/currency_xp.webp`" class="res-icon" alt="XP" />
        </div>
      </div>

      <div class="metric-item">
        <label class="metric-label">Resources Required</label>
        <div class="resource-stack">
          <div class="resource-group gold">
            <span class="value">{{ formatNumber(result.totalGoldSpent) }}</span>
            <img :src="`${baseUrl}assets/game/currency_gold.webp`" class="res-icon" alt="Gold" />
          </div>
          <div v-if="result.totalGemsSpent > 0" class="resource-group gems">
            <span class="value">{{ formatNumber(result.totalGemsSpent) }}</span>
            <img :src="`${baseUrl}assets/game/currency_gem.webp`" class="res-icon" alt="Gems" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.glass-panel {
  background: var(--sys-surface-glass);
  backdrop-filter: var(--sys-surface-glass-blur);
  border: 1px solid var(--sys-surface-glass-border);
  border-radius: var(--shape-corner-l);
  padding: 24px;
  box-shadow: var(--sys-elevation-3);
  position: relative;
  overflow: hidden;
}

.summary-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
}

.player-name {
  font-size: 24px;
  font-weight: 900;
  letter-spacing: -0.02em;
  color: var(--sys-color-on-surface);
}

.player-tag {
  font-family: var(--sys-font-family-mono);
  font-size: 13px;
  opacity: 0.5;
  font-weight: 700;
}

.projection-badge {
  background: var(--sys-color-primary-container);
  color: var(--sys-color-on-primary-container);
  padding: 6px 12px;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.projection-badge .label {
  font-size: 9px;
  font-weight: 900;
  text-transform: uppercase;
  opacity: 0.7;
}

.projection-badge .value {
  font-family: var(--sys-font-family-mono);
  font-size: 14px;
  font-weight: 800;
}

.metrics-grid {
  display: grid;
  grid-template-columns: 1.4fr 1fr 1fr;
  gap: 20px;
  align-items: start;
}

@media (max-width: 640px) {
  .metrics-grid {
    grid-template-columns: 1fr;
    gap: 24px;
    align-items: flex-start;
  }
}

.metric-item {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.metric-label {
  font-size: 11px;
  font-weight: 850;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  opacity: 0.5;
}

/* King Level Display */
.king-level-display {
  display: flex;
  align-items: center;
  gap: 12px;
}

.level-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--sys-color-surface-container-high);
  padding: 8px 14px;
  border-radius: 12px;
  border: 1px solid var(--sys-color-outline-variant);
}

.level-badge .num {
  font-size: 20px;
  font-weight: 900;
  color: var(--sys-color-on-surface);
}

.level-badge.current {
  opacity: 0.6;
}

.level-badge.target {
  background: var(--sys-color-primary-container);
  border-color: var(--sys-color-primary);
  box-shadow: 0 4px 12px rgba(var(--sys-color-primary-rgb), 0.2);
}

.level-badge.target .num {
  color: var(--sys-color-on-primary-container);
  font-size: 24px;
}

.level-icon {
  width: 20px;
  height: 20px;
  object-fit: contain;
}

.progression-arrow {
  opacity: 0.3;
  color: var(--sys-color-on-surface);
}

/* Resource Groups */
.resource-stack {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.resource-group {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--sys-color-surface-container-highest);
  padding: 10px 14px;
  border-radius: 12px;
  width: fit-content;
  min-width: 100px;
  border: 1px solid transparent;
}

.resource-group .value {
  font-family: var(--sys-font-family-mono);
  font-size: 16px;
  font-weight: 800;
  color: var(--sys-color-on-surface);
}

.resource-group .res-icon {
  width: 18px;
  height: 18px;
  object-fit: contain;
}

.resource-group.gems {
  background: rgba(255, 222, 235, 0.1);
  border-color: rgba(255, 105, 180, 0.2);
}

.resource-group.gems .value {
  color: #ffdeeb;
}

.resource-group.xp {
  background: rgba(var(--sys-color-primary-rgb), 0.05);
}

.resource-group.gold {
  background: rgba(255, 215, 0, 0.05);
}

.efficiency-strip {
  margin-top: 32px;
  background: var(--sys-color-surface-container-highest);
  padding: 16px;
  border-radius: 16px;
  border: 1px solid var(--sys-color-outline-variant);
}

.track {
  height: 8px;
  background: rgba(0,0,0,0.1);
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 12px;
}

.fill {
  height: 100%;
  background: linear-gradient(90deg, var(--sys-color-primary), var(--sys-color-success));
  border-radius: 4px;
  transition: width 1s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.efficiency-details {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  font-weight: 850;
  color: var(--sys-color-on-surface-variant);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.efficiency-details b {
  color: var(--sys-color-success);
}

</style>
