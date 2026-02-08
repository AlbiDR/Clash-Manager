<script setup lang="ts">
import { type OptimizationSettings } from "../../logic/Quartermaster/Quartermaster_Types";
import Icon from "../Icon.vue";

const props = defineProps<{
  settings: OptimizationSettings;
}>();

const emit = defineEmits<{
  update: [newSettings: Partial<OptimizationSettings>];
}>();

const setStrategy = (val: "Gold" | "Gems") => {
  emit("update", { strategy: val });
};

const handleTargetInput = (e: Event) => {
  const val = parseInt((e.target as HTMLInputElement).value) || undefined;
  emit("update", { targetLevel: val });
};

const toggleInfinite = () => {
  emit("update", { infiniteGold: !props.settings.infiniteGold });
};
</script>

<template>
  <div class="settings-card glass-panel">
    <h3 class="panel-header">
      <Icon name="gear" size="16" />
      <span>Parameters</span>
    </h3>

    <div class="settings-grid">
      <!-- Strategy Selector -->
      <div class="setting-item">
        <label class="setting-label">Priority Strategy</label>
        <div class="strategy-selector">
          <button 
            class="strategy-btn" 
            :class="{ active: settings.strategy === 'Gold' }"
            @click="setStrategy('Gold')"
          >
            <img src="/assets/game/currency_gold.webp" class="res-asset" alt="Gold" />
            <span>Gold</span>
          </button>
          <button 
            class="strategy-btn" 
            :class="{ active: settings.strategy === 'Gems' }"
            @click="setStrategy('Gems')"
          >
            <img src="/assets/game/currency_gem.webp" class="res-asset" alt="Gems" />
            <span>Gems</span>
          </button>
        </div>
      </div>

      <!-- Target Level -->
      <div class="setting-item">
        <label class="setting-label">Target King Level</label>
        <div class="input-wrapper">
          <input 
            type="number" 
            :value="settings.targetLevel" 
            placeholder="Auto (Max)"
            class="num-input"
            min="1"
            max="90"
            @input="handleTargetInput"
          >
          <span class="input-unit">v</span>
        </div>
      </div>

      <!-- Infinite Toggle -->
      <label class="toggle-row">
        <div class="toggle-info">
          <span class="label">Infinite Logistics</span>
          <span class="sub">Ignore gold constraints</span>
        </div>
        <div 
          class="custom-toggle" 
          :class="{ active: settings.infiniteGold }"
          @click="toggleInfinite"
        >
          <div class="toggle-nob"></div>
        </div>
      </label>
    </div>
  </div>
</template>

<style scoped>
.glass-panel {
  background: var(--sys-surface-glass);
  backdrop-filter: var(--sys-surface-glass-blur);
  border: 1px solid var(--sys-surface-glass-border);
  border-radius: var(--shape-corner-l);
  padding: 16px;
  box-shadow: var(--sys-elevation-2);
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 850;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  opacity: 0.7;
  margin-bottom: 20px;
}

.settings-grid {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.setting-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.setting-label {
  font-size: 12px;
  font-weight: 700;
  opacity: 0.6;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.strategy-selector {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  background: var(--sys-color-surface-container-high);
  padding: 4px;
  border-radius: 12px;
}

.strategy-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px;
  border: none;
  background: transparent;
  color: var(--sys-color-on-surface);
  font-size: 13px;
  font-weight: 700;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  opacity: 0.6;
}

.strategy-btn.active {
  background: var(--sys-color-surface);
  box-shadow: var(--sys-elevation-1);
  opacity: 1;
}

.strategy-btn:hover:not(.active) {
  background: rgba(var(--sys-color-on-surface-rgb), 0.05);
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.num-input {
  background: var(--sys-color-surface-container);
  border: 1px solid var(--sys-color-outline-variant);
  border-radius: 12px;
  padding: 10px 14px;
  font-family: var(--sys-font-family-mono);
  font-size: 16px;
  font-weight: 700;
  color: var(--sys-color-on-surface);
  width: 100%;
}

.num-input:focus {
  outline: none;
  border-color: var(--sys-color-primary);
}

.res-asset {
  width: 14px;
  height: 14px;
  object-fit: contain;
}

.input-unit {
  position: absolute;
  right: 14px;
  font-size: 14px;
  font-weight: 800;
  opacity: 0.3;
}

.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  cursor: pointer;
  padding-top: 8px;
  border-top: 1px solid var(--sys-color-outline-variant);
}

.toggle-info {
  display: flex;
  flex-direction: column;
}

.toggle-info .label {
  font-size: 14px;
  font-weight: 700;
  color: var(--sys-color-on-surface);
}

.toggle-info .sub {
  font-size: 10px;
  font-weight: 500;
  opacity: 0.5;
  text-transform: uppercase;
}

.custom-toggle {
  width: 44px;
  height: 24px;
  background: var(--sys-color-surface-container-highest);
  border-radius: 12px;
  position: relative;
  transition: background 0.3s ease;
}

.custom-toggle.active {
  background: var(--sys-color-primary);
}

.toggle-nob {
  width: 18px;
  height: 18px;
  background: white;
  border-radius: 50%;
  position: absolute;
  top: 3px;
  left: 3px;
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
}

.custom-toggle.active .toggle-nob {
  transform: translateX(20px);
}

/* Hide arrows */
input::-webkit-outer-spin-button,
input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
</style>
