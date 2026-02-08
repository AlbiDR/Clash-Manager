<script setup lang="ts">
import { type OptimizationResult, type PlayerProfile } from "../../logic/Quartermaster/Quartermaster_Types";
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
        <div class="metric-meta">
          <img :src="`${baseUrl}assets/game/tower_level.webp`" class="res-asset" alt="Tower" />
          <span class="label">Target Level</span>
        </div>
        <div class="value-stack">
          <span class="current">{{ profile.kingLevel }}</span>
          <Icon name="chevron_right" size="14" class="arrow" />
          <span class="target">{{ result.projectedKingLevel }}</span>
        </div>
      </div>

      <!-- Row 2: Resources -->
      <div class="metric-item">
        <span class="label">Experience Required</span>
        <div class="value-group">
          <span class="value">+{{ formatNumber(result.totalXpGained) }}</span>
          <img :src="`${baseUrl}assets/game/currency_xp.webp`" class="res-asset" alt="XP" />
        </div>
      </div>

      <div class="metric-item">
        <span class="label">Resources Required</span>
        <div class="value-group">
          <span class="value">{{ formatNumber(result.totalGoldSpent) }}</span>
          <img :src="`${baseUrl}assets/game/currency_gold.webp`" class="res-asset" alt="Gold" />
        </div>
        <!-- Gem Secondary Row -->
        <div v-if="result.totalGemsSpent > 0" class="value-group gem-secondary">
          <span class="value small">{{ formatNumber(result.totalGemsSpent) }}</span>
          <img :src="`${baseUrl}assets/game/currency_gem.webp`" class="res-asset" alt="Gems" />
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
  grid-template-columns: 1.2fr 1fr 1fr;
  gap: 16px;
  align-items: center;
}

@media (max-width: 480px) {
  .metrics-grid {
    grid-template-columns: 1fr;
    gap: 20px;
  }
}

.metric-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.metric-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.king-icon { color: #f39c12; }

.label {
  font-size: 11px;
  font-weight: 850;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  opacity: 0.6;
}

.value-stack {
  display: flex;
  align-items: center;
  gap: 12px;
}

.current {
  font-size: 28px;
  font-weight: 900;
  opacity: 0.4;
}

.arrow {
  opacity: 0.3;
}

.target {
  font-size: 32px;
  font-weight: 900;
  color: var(--sys-color-primary);
  text-shadow: 0 0 20px rgba(var(--sys-color-primary-rgb), 0.3);
}

.value-group {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.value {
  font-family: var(--sys-font-family-mono);
  font-size: 18px;
  font-weight: 800;
}

.unit {
  font-size: 12px;
  font-weight: 900;
  opacity: 0.5;
}

.res-asset {
  width: 16px;
  height: 16px;
  object-fit: contain;
}

.gem-secondary {
  margin-top: 4px;
  opacity: 0.8;
  padding-top: 4px;
  border-top: 1px solid rgba(var(--sys-color-on-surface-rgb, 0, 0, 0), 0.05);
}

.value.small {
  font-size: 14px;
}

.efficiency-strip {
  margin-top: 32px;
  background: var(--sys-color-surface-container-highest);
  padding: 12px;
  border-radius: 16px;
}

.track {
  height: 6px;
  background: rgba(0,0,0,0.1);
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 8px;
}

.fill {
  height: 100%;
  background: linear-gradient(90deg, var(--sys-color-primary), var(--sys-color-success));
  border-radius: 3px;
  transition: width 1s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.efficiency-details {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  font-weight: 850;
  color: var(--sys-color-success);
  text-transform: uppercase;
}
</style>
