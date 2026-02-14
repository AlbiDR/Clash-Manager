<script setup lang="ts">
import Icon from "../../../shared/ui/Icon.vue";
import { type OptimizationResult, type PlayerProfile } from "../logic/Laboratory_Types";
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
        <span class="player-tag">{{ profile.tag.startsWith('#') ? profile.tag : '#' + profile.tag }}</span>
      </div>
      <div class="projection-badge">
        <span class="label">Trajectory</span>
        <span class="value">{{ result.actions.length }} {{ result.actions.length === 1 ? 'Upgrade' : 'Upgrades' }}</span>
      </div>
    </div>

    <!-- 1. Progression Row (Always full width) -->
    <div class="progression-row">
      <label class="section-label">Target Progress</label>
      <div class="king-level-display">
        <div class="level-badge current">
          <span class="num">{{ profile.currentKingLevel || profile.kingLevel }}</span>
          <img :src="`${baseUrl}assets/game/tower_level.webp`" class="level-icon" alt="Tower" />
        </div>
        <div class="progression-divider">
          <Icon name="chevron_right" size="18" />
        </div>
        <div class="level-badge target">
          <span class="num">{{ result.projectedKingLevel }}</span>
          <img :src="`${baseUrl}assets/game/tower_level.webp`" class="level-icon" alt="Tower" />
        </div>
      </div>
    </div>

    <!-- 2. Resources Grid (Unified & Symmetrical) -->
    <div class="metrics-section">
      <label class="section-label">Required for Projection</label>
      <div class="resources-grid" :class="{ 'triple': result.totalGemsSpent > 0 }">
        <div class="res-slab xp">
          <img :src="`${baseUrl}assets/game/currency_xp.webp`" class="res-icon" alt="XP" />
          <div class="res-meta">
            <span class="val">{{ formatNumber(result.totalXpGained) }}</span>
            <span class="label">Experience</span>
          </div>
        </div>
        
        <div class="res-slab gold">
          <img :src="`${baseUrl}assets/game/currency_gold.webp`" class="res-icon" alt="Gold" />
          <div class="res-meta">
            <span class="val">{{ formatNumber(result.totalGoldSpent) }}</span>
            <span class="label">Gold</span>
          </div>
        </div>

        <div v-if="result.totalGemsSpent > 0" class="res-slab gems">
          <img :src="`${baseUrl}assets/game/currency_gem.webp`" class="res-icon" alt="Gems" />
          <div class="res-meta">
            <span class="val">{{ formatNumber(result.totalGemsSpent) }}</span>
            <span class="label">Gems</span>
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
  letter-spacing: 0.05em;
}

.projection-badge {
  background: var(--sys-color-primary-container);
  color: var(--sys-color-on-primary-container);
  padding: 8px 14px;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  border: 1px solid rgba(var(--sys-color-primary-rgb), 0.2);
}

.projection-badge .label {
  font-size: 9px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  opacity: 0.6;
}

.projection-badge .value {
  font-family: var(--sys-font-family-mono);
  font-size: 13px;
  font-weight: 850;
}

/* Sections */
.progression-row, .metrics-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 24px;
}

.section-label {
  font-size: 10px;
  font-weight: 850;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  opacity: 0.4;
  margin-bottom: 2px;
}

/* King Level Display */
.king-level-display {
  display: flex;
  align-items: center;
  gap: 8px;
}

.level-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--sys-color-surface-container-high);
  padding: 8px 16px;
  border-radius: 14px;
  border: 1px solid var(--sys-color-outline-variant);
  min-width: 80px;
  justify-content: center;
}

.level-badge .num {
  font-size: 20px;
  font-weight: 900;
  color: var(--sys-color-on-surface);
}

.level-badge.current {
  opacity: 0.5;
  filter: grayscale(0.2);
}

.level-badge.target {
  background: var(--sys-color-primary-container);
  border-color: var(--sys-color-primary);
  box-shadow: 0 4px 15px rgba(var(--sys-color-primary-rgb), 0.15);
}

.level-badge.target .num {
  color: var(--sys-color-on-primary-container);
}

.level-icon {
  width: 18px;
  height: 18px;
  object-fit: contain;
}

.progression-divider {
  opacity: 0.2;
  display: flex;
  color: var(--sys-color-on-surface);
}

/* Resources Grid */
.resources-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.resources-grid.triple {
  grid-template-columns: repeat(3, 1fr);
}

@media (max-width: 640px) {
  .resources-grid, .resources-grid.triple {
    grid-template-columns: 1fr;
    gap: 8px;
  }
}

.res-slab {
  display: flex;
  align-items: center;
  gap: 16px;
  background: var(--sys-color-surface-container-low);
  padding: 14px 18px;
  border-radius: 16px;
  border: 1px solid var(--sys-color-outline-variant);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.res-icon {
  width: 24px;
  height: 24px;
  object-fit: contain;
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.1));
}

.res-meta {
  display: flex;
  flex-direction: column;
}

.res-meta .val {
  font-family: var(--sys-font-family-mono);
  font-size: 16px;
  font-weight: 850;
  color: var(--sys-color-on-surface);
}

.res-meta .label {
  font-size: 9px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  opacity: 0.5;
}

/* Color Coding for Slabs */
.res-slab.xp {
  border-left: 3px solid #00d2ff;
  background: rgba(0, 210, 255, 0.02);
}
.res-slab.gold {
  border-left: 3px solid #ffcc00;
  background: rgba(255, 204, 0, 0.02);
}
.res-slab.gems {
  border-left: 3px solid #00ff88;
  background: rgba(0, 255, 136, 0.02);
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
