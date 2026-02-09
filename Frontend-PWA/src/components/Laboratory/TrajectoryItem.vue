<script setup lang="ts">
import { type UpgradeAction } from "../../logic/Laboratory/Laboratory_Types";
import Icon from "../Icon.vue";

defineProps<{
  upgrade: UpgradeAction;
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
      <!-- Line 1: Level Progression -->
      <div class="level-row">
        <div class="level-pill">
          <span class="prev">{{ upgrade.currentLevel }}</span>
          <Icon name="chevron_right" size="10" class="divider" />
          <span class="next">{{ upgrade.targetLevel }}</span>
        </div>
        <span class="logic-type">{{ upgrade.upgradeType }}</span>
      </div>

      <!-- Line 2: Card Name (Prominent) -->
      <div class="name-row">
        <span class="card-name">{{ upgrade.cardName }}</span>
      </div>

      <!-- Line 3: Metadata -->
      <div class="meta-row">
        <span class="efficiency-ratio">η {{ upgrade.efficiencyRatio.toFixed(2) }}</span>
      </div>
    </div>

    <div class="cost-stack">
      <div v-if="upgrade.gemsUsed > 0" class="cost-item gem">
        <span class="val">{{ formatNumber(upgrade.gemsUsed) }}</span>
        <img :src="`${baseUrl}assets/game/currency_gem.webp`" class="res-icon" alt="Gems" />
      </div>
      <div v-else-if="upgrade.wildCardsUsed > 0" class="cost-item wild">
        <span class="val">{{ formatNumber(upgrade.wildCardsUsed) }}</span>
        <img :src="`${baseUrl}assets/game/wildcard_${upgrade.rarity.toLowerCase()}.webp`" class="res-icon" alt="WildCards" />
      </div>
      <div class="cost-item gold">
        <span class="val">{{ formatNumber(upgrade.goldCost) }}</span>
        <img :src="`${baseUrl}assets/game/currency_gold.webp`" class="res-icon" alt="Gold" />
      </div>
      <div class="cost-item xp">
        <span class="val">+{{ formatNumber(upgrade.xpGained) }}</span>
        <img :src="`${baseUrl}assets/game/currency_xp.webp`" class="res-icon sm" alt="XP" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.trajectory-item {
  display: flex;
  align-items: center;
  gap: 16px;
  background: var(--sys-color-surface-container-low);
  border: 1px solid var(--sys-color-outline-variant);
  border-radius: 16px;
  padding: 14px 18px;
  position: relative;
  animation: slide-in 0.4s cubic-bezier(0.2, 0, 0, 1) both;
  animation-delay: calc(var(--i) * 0.05s);
  border-left: 4px solid transparent;
}

@keyframes slide-in {
  from { opacity: 0; transform: translateX(10px); }
  to { opacity: 1; transform: translateX(0); }
}

/* Rarity Highlights - Enhanced Visual Hierarchy */
.trajectory-item.common { 
  border-left-color: #acb3bc; 
  background: var(--sys-color-surface-container-low);
}
.trajectory-item.rare { 
  border-left-color: #e67e22; 
  background: linear-gradient(90deg, var(--sys-color-surface-container-low) 0%, rgba(230, 126, 34, 0.05) 100%);
}
.trajectory-item.epic { 
  border-left-color: #9b59b6; 
  background: linear-gradient(90deg, var(--sys-color-surface-container-low) 0%, rgba(155, 89, 182, 0.08) 100%);
}
.trajectory-item.legendary { 
  border-left-color: #00d2ff;
  background: linear-gradient(90deg, var(--sys-color-surface-container-low) 0%, rgba(0, 210, 255, 0.12) 100%);
  box-shadow: 0 4px 20px -8px rgba(0, 210, 255, 0.3);
}
.trajectory-item.champion { 
  border-left-color: #ffca28; 
  background: linear-gradient(90deg, var(--sys-color-surface-container-low) 0%, rgba(255, 202, 40, 0.15) 100%);
  box-shadow: 0 4px 24px -10px rgba(255, 202, 40, 0.4);
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

.meta-row {
  display: flex;
  align-items: center;
}

.efficiency-ratio {
  font-family: var(--sys-font-family-mono);
  font-size: 10px;
  font-weight: 900;
  color: var(--sys-color-success);
  opacity: 0.8;
  letter-spacing: 0.05em;
}

.cost-stack {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  min-width: 100px;
}

.cost-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--sys-font-family-mono);
  font-size: 15px; /* Equalized font size */
  font-weight: 850;
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
}

.res-icon.sm {
  width: 12px;
  height: 12px;
}
</style>
