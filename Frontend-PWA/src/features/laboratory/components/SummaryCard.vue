<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import { Icon } from "@shared";
import { type OptimizationResult, type PlayerProfile, type OptimizationSettings } from "../logic";
import { computed } from "vue";
const props = defineProps<{
  result: OptimizationResult;
  profile: PlayerProfile;
  settings?: OptimizationSettings;
}>();

const formatNumber = (valueToFormat: number) => {
  return new Intl.NumberFormat().format(valueToFormat);
};

const engineStatus = computed(() => {
  if (!props.settings) {
    return { class: 'reached', text: 'Engine Operational', icon: 'check-circle' };
  }
  if (props.settings.strategy === 'Level Projection') {
    if (props.settings.targetLevel && props.result.projectedKingLevel < props.settings.targetLevel) {
      return { class: 'stalled', text: 'Progression Cap Hit', icon: 'warning' };
    }
    return { class: 'reached', text: 'Target Reached', icon: 'check-circle' };
  } else {
    // Resource Efficiency
    if (props.result.actions.length === 0) {
       return { class: 'stalled', text: 'No Affordable Upgrades', icon: 'warning' };
    }
    return { class: 'depleted', text: 'Resources Depleted', icon: 'check-circle' };
  }
});

const baseUrl = import.meta.env.BASE_URL;

</script>

<template>
  <div class="summary-card glass-panel" style="overflow: hidden;">
    <div class="summary-header">
      <div class="player-info">
        <h2 class="player-name">{{ profile.name }}</h2>
        <span class="player-tag">{{ profile.tag.startsWith('#') ? profile.tag : '#' + profile.tag }}</span>
      </div>
      <div class="header-badges">
        <div class="projection-badge status" :class="engineStatus.class">
          <span class="label">Status</span>
          <span class="value"><Icon :name="engineStatus.icon" size="12" /> {{ engineStatus.text }}</span>
        </div>
        <div class="projection-badge">
          <span class="label">Trajectory</span>
          <span class="value">{{ result.actions.length }} {{ result.actions.length === 1 ? 'Upgrade' : 'Upgrades' }}</span>
        </div>
      </div>
    </div>

    <!-- 1. Progression Row (Always full width) -->
    <div class="progression-row">
      <label class="section-label">Target Progress</label>
      <div class="king-level-display">
        <div class="level-badge current">
          <span class="num">{{ profile.currentKingLevel || profile.kingLevel }}</span>
          <img :src="`${baseUrl}assets/game/tower-level.webp`" class="level-icon" alt="Tower" />
        </div>
        <div class="progression-divider">
          <Icon name="chevron_right" size="18" />
        </div>
        <div class="level-badge target">
          <span class="num">{{ result.projectedKingLevel }}</span>
          <img :src="`${baseUrl}assets/game/tower-level.webp`" class="level-icon" alt="Tower" />
        </div>
      </div>
    </div>

    <!-- 2. Resources Grid (Unified & Symmetrical) -->
    <div class="metrics-section">
      <label class="section-label">Required for Projection</label>
      <div class="resources-grid" :class="{ 'triple': result.totalGemsSpent > 0 }">
        <div class="res-slab xp">
          <img :src="`${baseUrl}assets/game/currency-xp.webp`" class="res-icon" alt="XP" />
          <div class="res-meta">
            <span class="val">{{ formatNumber(result.totalXpGained) }}</span>
            <span class="label">Experience</span>
          </div>
        </div>
        
        <div class="res-slab gold">
          <img :src="`${baseUrl}assets/game/currency-gold.webp`" class="res-icon" alt="Gold" />
          <div class="res-meta">
            <span class="val">{{ formatNumber(result.totalGoldSpent) }}</span>
            <span class="label">Gold</span>
          </div>
        </div>

        <div v-if="result.totalGemsSpent > 0" class="res-slab gems">
          <img :src="`${baseUrl}assets/game/currency-gem.webp`" class="res-icon" alt="Gems" />
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
.summary-header {
  display: flex;
  flex-direction: column;
  gap: 16px;
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

.header-badges {
  display: flex;
  gap: 8px;
  width: 100%;
}

.projection-badge {
  color: var(--sys-color-on-primary-container);
  padding: 6px 10px;
  border-radius: var(--sys-shape-corner-small);
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  border: 1px solid rgba(var(--sys-color-primary-rgb), 0.1);
  background: var(--sys-color-surface-container);
  flex: 1;
  gap: 8px;
}

.projection-badge.status {
  background: var(--sys-color-surface-container-high);
}

.projection-badge.status.stalled {
  border-color: rgba(var(--sys-color-error-rgb), 0.5);
  color: var(--sys-color-error);
}

.projection-badge.status.reached,
.projection-badge.status.depleted {
  border-color: rgba(var(--sys-color-success-rgb), 0.5);
  color: var(--sys-color-success);
}

.projection-badge.status .value {
  display: flex;
  align-items: center;
  gap: 4px;
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
  border-radius: var(--sys-shape-corner-large);
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

@media (max-width: 320px) {
  .resources-grid, .resources-grid.triple {
    grid-template-columns: 1fr;
    gap: 8px;
  }
}

@media (min-width: 321px) and (max-width: 640px) {
  .resources-grid.triple {
    grid-template-columns: 1fr;
  }
  .resources-grid {
    grid-template-columns: 1fr 1fr;
  }
}

.res-slab {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--sys-color-surface-container-low);
  padding: 10px 14px;
  border-radius: var(--sys-shape-corner-medium);
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
  border-radius: var(--sys-shape-corner-large);
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
