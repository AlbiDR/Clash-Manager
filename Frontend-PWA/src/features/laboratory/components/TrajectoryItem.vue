// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

<script setup lang="ts">
/**
 * [FEATURE] TRAJECTORY ITEM
 * ----------------------------------------------------------------------------
 * Rationale: Presentation component for a single upgrade action in the
 * progression trajectory.
 * Layer: @features/laboratory
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * Displays the transformation of a card (level, rarity) and the resources
 * required (gold, wildcards, gems) along with the gained experience.
 * Optimized via `v-memo` in the parent view to prevent re-renders during
 * intensive simulation cycles.
 */
import { Icon } from "@shared";
import { type UpgradeAction } from "../logic";
defineProps<{
  /** The upgrade action data to display. */
  upgrade: UpgradeAction;
  /** The index in the list for animation staggering. */
  index: number;
}>();

const formatNumber = (num: number) => {
  return new Intl.NumberFormat().format(num);
};

const baseUrl = import.meta.env.BASE_URL;
</script>

<template>
  <div 
    class="trajectory-item" 
    :class="upgrade.rarity.toLowerCase()"
    :style="{ '--i': index }"
  >
    <div class="upgrade-info">
      <!-- Line 1: Card Name -->
      <div class="name-row">
        <span class="card-name">{{ upgrade.cardName }}</span>
      </div>

      <!-- Line 2: Level Progression -->
      <div class="level-row">
        <div class="level-pill">
          <span class="prev">{{ upgrade.currentLevel }}</span>
          <Icon name="chevron_right" size="10" class="divider" />
          <span class="next">{{ upgrade.targetLevel }}</span>
        </div>
        <span class="logic-type">{{ upgrade.upgradeType }}</span>
        <span v-if="upgrade.isTowerTroop" class="tower-badge">Tower</span>
      </div>

      <!-- Line 3: Efficiency Index -->
      <div class="efficiency-slab efficiency">
        <Icon name="psychology" size="12" class="eff-icon" />
        <span class="eff-val">{{ upgrade.efficiencyIndex.toFixed(2) }}</span>
        <span class="eff-label">EFFICIENCY</span>
      </div>
    </div>

    <div class="cost-stack">
      <div v-if="upgrade.gemsUsed > 0" class="cost-item gem">
        <span class="val">{{ formatNumber(upgrade.gemsUsed) }}</span>
        <img :src="`${baseUrl}assets/game/currency-gem.webp`" class="res-icon" alt="Gems" />
      </div>
      <div v-else-if="upgrade.wildCardsUsed > 0" class="cost-item wild">
        <span class="val">{{ formatNumber(upgrade.wildCardsUsed) }}</span>
        <img :src="`${baseUrl}assets/game/wildcard-${upgrade.rarity.toLowerCase()}.webp`" class="res-icon" alt="WildCards" />
      </div>
      <div class="cost-item gold">
        <span class="val">{{ formatNumber(upgrade.goldCost) }}</span>
        <img :src="`${baseUrl}assets/game/currency-gold.webp`" class="res-icon" alt="Gold" />
      </div>
      <div class="cost-item xp">
        <span class="val">+{{ formatNumber(upgrade.xpGained) }}</span>
        <img :src="`${baseUrl}assets/game/currency-xp.webp`" class="res-icon sm" alt="XP" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.trajectory-item {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--sys-color-surface-container-low);
  border: 1px solid var(--sys-color-outline-variant);
  border-radius: var(--shape-corner-large);
  padding: 10px 14px;
  position: relative;
  animation: slide-in 0.4s cubic-bezier(0.2, 0, 0, 1) both;
  animation-delay: calc(min(var(--i), 10) * 0.05s);
  border-left: 4px solid transparent;
}

@keyframes slide-in {
  from { opacity: 0; transform: translateX(10px); }
  to { opacity: 1; transform: translateX(0); }
}

/* Rarity Highlights - Enhanced Visual Hierarchy */
.trajectory-item.common { 
  border-left-color: #A5B1C2; 
  background: var(--sys-color-surface-container-low);
}
.trajectory-item.rare { 
  border-left-color: #D35400; 
  background: linear-gradient(90deg, var(--sys-color-surface-container-low) 0%, rgba(211, 84, 0, 0.05) 100%);
}
.trajectory-item.epic { 
  border-left-color: #8E44AD; 
  background: linear-gradient(90deg, var(--sys-color-surface-container-low) 0%, rgba(142, 68, 173, 0.08) 100%);
}
.trajectory-item.legendary { 
  border-left-color: #00D2D3;
  background: linear-gradient(90deg, var(--sys-color-surface-container-low) 0%, rgba(0, 210, 211, 0.12) 100%);
  box-shadow: 0 4px 20px -8px rgba(0, 210, 211, 0.3);
}
.trajectory-item.champion { 
  border-left-color: #F1C40F; 
  background: linear-gradient(90deg, var(--sys-color-surface-container-low) 0%, rgba(241, 196, 15, 0.18) 100%);
  box-shadow: 0 4px 28px -8px rgba(241, 196, 15, 0.5);
}

.trajectory-item:hover {
  transform: translateY(-1px);
  filter: brightness(1.05);
  background: var(--sys-color-surface-container);
}

.upgrade-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start; /* Ensure all children are left-aligned and don't stretch */
  gap: 6px;
  min-width: 0;
}

.level-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.level-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--sys-color-surface-container-high);
  padding: 2px 8px;
  border-radius: 6px;
  font-family: var(--sys-font-family-mono);
  font-size: 11px;
  font-weight: 850;
  border: 1px solid var(--sys-color-outline-variant);
}

.level-pill .prev { opacity: 0.4; }
.level-pill .next { color: var(--sys-color-primary); }
.level-pill .divider { opacity: 0.2; }

.logic-type {
  font-size: 9px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  opacity: 0.4;
}

.tower-badge {
  font-size: 8px;
  font-weight: 900;
  text-transform: uppercase;
  background: var(--sys-color-surface-container-highest);
  color: var(--sys-color-primary);
  padding: 1px 4px;
  border-radius: 4px;
  letter-spacing: 0.05em;
  border: 1px solid rgba(var(--sys-color-primary-rgb), 0.2);
}

.name-row {
  display: flex;
}

.card-name {
  font-size: 18px;
  font-weight: 900;
  color: var(--sys-color-on-surface);
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.efficiency-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.efficiency-slab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 6px; /* Reduced padding for tighter fit */
  background: var(--sys-color-surface-container);
  border-radius: 6px;
  border: 1px solid var(--sys-color-outline-variant);
  font-family: var(--sys-font-family-mono);
  font-size: 11px;
  font-weight: 800;
  width: fit-content;
}

.efficiency-slab.gold {
  border-left: 2px solid #ffcc00;
  background: rgba(255, 204, 0, 0.03);
}

.efficiency-slab.efficiency {
  border-left: 2px solid var(--sys-color-primary);
  background: rgba(var(--sys-color-primary-rgb), 0.05);
}

.eff-label {
  font-size: 8px;
  font-weight: 900;
  opacity: 0.5;
  letter-spacing: 0.05em;
  text-align: left;
}

.eff-icon {
  width: 12px;
  height: 12px;
  object-fit: contain;
  filter: drop-shadow(0 1px 2px rgba(0,0,0,0.1));
}

.eff-divider {
  opacity: 0.3;
  font-size: 10px;
  font-weight: 700;
}

.eff-val {
  color: #000000;
}
:root.dark .eff-val {
  color: #FFFFFF;
}

.cost-stack {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  flex-shrink: 0;
}

.cost-item {
  display: grid;
  grid-template-columns: 1fr 20px; /* Fixed width for the icon slot */
  align-items: center;
  gap: 10px;
  font-family: var(--sys-font-family-mono);
  font-size: 15px;
  font-weight: 850;
  text-align: right;
}

.cost-item.wild { color: var(--sys-color-primary); }
.cost-item.gold { color: var(--sys-color-on-surface); }
.cost-item.xp { 
  color: var(--sys-color-on-surface-variant); 
  font-size: 11px;
  opacity: 0.6;
}

.res-icon {
  width: 16px;
  height: 16px;
  object-fit: contain;
  justify-self: center; /* Center horizontally within the 20px grid column */
}

.res-icon.sm {
  width: 12px;
  height: 12px;
}
</style>
