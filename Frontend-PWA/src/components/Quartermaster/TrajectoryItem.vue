<script setup lang="ts">
import { type UpgradeAction } from "../../logic/Quartermaster/Quartermaster_Types";
import Icon from "../Icon.vue";

defineProps<{
  upgrade: UpgradeAction;
  index: number;
}>();

const formatNumber = (num: number) => {
  return new Intl.NumberFormat().format(num);
};
</script>

<template>
  <div class="trajectory-item" :style="{ '--i': index }">
    <div class="step-count">{{ index + 1 }}</div>
    
    <div class="card-avatar" :class="upgrade.rarity.toLowerCase()">
      <span class="rarity-letter">{{ upgrade.rarity.charAt(0) }}</span>
    </div>

    <div class="upgrade-info">
      <div class="top-row">
        <span class="card-name">{{ upgrade.cardName }}</span>
        <div class="level-badge">
          <span class="prev">{{ upgrade.currentLevel }}</span>
          <Icon name="chevron_right" size="10" />
          <span class="next">{{ upgrade.targetLevel }}</span>
        </div>
      </div>
      <div class="bottom-row">
        <span class="logic-type">{{ upgrade.upgradeType }} Upgrade</span>
        <span class="efficiency-ratio">η: {{ upgrade.efficiencyRatio.toFixed(2) }}</span>
      </div>
    </div>

    <div class="cost-stack">
      <div class="cost-item gold">
        <span class="val">{{ formatNumber(upgrade.goldCost) }}</span>
        <Icon name="donation" size="12" />
      </div>
      <div class="cost-item xp">
        <span class="val">+{{ formatNumber(upgrade.xpGained) }}</span>
        <span class="unit">XP</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.trajectory-item {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--sys-color-surface-container);
  border: 1px solid var(--sys-color-outline-variant);
  border-radius: 16px;
  padding: 10px 14px;
  position: relative;
  animation: slide-in 0.4s cubic-bezier(0.2, 0, 0, 1) both;
  animation-delay: calc(var(--i) * 0.05s);
}

@keyframes slide-in {
  from { opacity: 0; transform: translateX(10px); }
  to { opacity: 1; transform: translateX(0); }
}

.step-count {
  font-family: var(--sys-font-family-mono);
  font-size: 11px;
  font-weight: 900;
  opacity: 0.3;
  width: 14px;
}

.card-avatar {
  width: 40px;
  height: 48px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  flex-shrink: 0;
  box-shadow: 0 4px 8px rgba(0,0,0,0.1);
}

.card-avatar.common { background: linear-gradient(135deg, #e9ecef, #dee2e6); color: #495057; }
.card-avatar.rare { background: linear-gradient(135deg, #f1c40f, #f39c12); color: white; }
.card-avatar.epic { background: linear-gradient(135deg, #a55eea, #8854d0); color: white; }
.card-avatar.legendary { background: linear-gradient(135deg, #45aaf2, #2d98da); color: white; }
.card-avatar.champion { background: linear-gradient(135deg, #fed330, #f7b731); color: white; }

.rarity-letter {
  font-size: 18px;
  font-weight: 900;
  opacity: 0.8;
}

.upgrade-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.top-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.card-name {
  font-size: 15px;
  font-weight: 850;
  color: var(--sys-color-on-surface);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.level-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--sys-color-surface-container-highest);
  padding: 2px 6px;
  border-radius: 6px;
  font-family: var(--sys-font-family-mono);
  font-size: 11px;
  font-weight: 800;
}

.prev { opacity: 0.5; }
.next { color: var(--sys-color-primary); }

.bottom-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.logic-type {
  font-size: 11px;
  font-weight: 700;
  opacity: 0.5;
  text-transform: uppercase;
}

.efficiency-ratio {
  font-family: var(--sys-font-family-mono);
  font-size: 10px;
  font-weight: 900;
  color: var(--sys-color-success);
}

.cost-stack {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  min-width: 80px;
}

.cost-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-family: var(--sys-font-family-mono);
  font-size: 13px;
  font-weight: 800;
}

.cost-item.gold { color: var(--sys-color-on-surface); }
.cost-item.xp { color: var(--sys-color-success); font-size: 11px; }

.unit {
  font-size: 9px;
  font-weight: 900;
  opacity: 0.7;
}
</style>
