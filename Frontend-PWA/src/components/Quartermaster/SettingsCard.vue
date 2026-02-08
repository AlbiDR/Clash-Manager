<script setup lang="ts">
import { type OptimizationSettings } from "../../logic/Quartermaster/Quartermaster_Types";
import { IMPORTANT_KING_LEVELS } from "../../logic/Quartermaster/Quartermaster_Tables";
import Icon from "../Icon.vue";

const props = defineProps<{
  settings: OptimizationSettings;
  currentLevel: number;
}>();

const emit = defineEmits<{
  update: [newSettings: Partial<OptimizationSettings>];
}>();

const setStrategy = (val: "Target" | "Maximize") => {
  // If switching to Maximize, disable infinite resources as it makes no sense
  const updates: Partial<OptimizationSettings> = { strategy: val };
  if (val === "Maximize") {
    updates.infiniteResources = false;
  }
  emit("update", { ...props.settings, ...updates });
};

const handleTargetChange = (e: Event) => {
  const val = parseInt((e.target as HTMLSelectElement).value);
  emit("update", { targetLevel: val });
};

const toggleInfinite = () => {
  if (props.settings.strategy === "Maximize") return; // Locked for Maximize
  emit("update", { infiniteResources: !props.settings.infiniteResources });
};

const baseUrl = import.meta.env.BASE_URL;
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
        <label class="setting-label">Strategy</label>
        <div class="strategy-selector">
          <button 
            class="strategy-btn" 
            :class="{ active: settings.strategy === 'Target' }"
            @click="setStrategy('Target')"
          >
            <Icon name="target" size="14" />
            <span>Target Level</span>
          </button>
          <button 
            class="strategy-btn" 
            :class="{ active: settings.strategy === 'Maximize' }"
            @click="setStrategy('Maximize')"
          >
            <Icon name="trending-up" size="14" />
            <span>Maximize Value</span>
          </button>
        </div>
      </div>

      <!-- Target Level Selector -->
      <div class="setting-item" :class="{ disabled: settings.strategy === 'Maximize' }">
        <label class="setting-label">Target King Level</label>
        <div class="select-wrapper">
          <select 
            class="level-select" 
            :value="settings.targetLevel || 90" 
            :disabled="settings.strategy === 'Maximize'"
            @change="handleTargetChange"
          >
            <option 
              v-for="level in 90" 
              :key="level" 
              :value="level"
              :disabled="level <= currentLevel"
              :class="{ 
                milestone: IMPORTANT_KING_LEVELS.includes(level as any),
                past: level <= currentLevel 
              }"
            >
              Level {{ level }} {{ IMPORTANT_KING_LEVELS.includes(level as any) ? '★' : '' }}
            </option>
          </select>
          <Icon name="chevron-down" size="14" class="select-icon" />
        </div>
      </div>

      <!-- Infinite Resources Toggle -->
      <label class="toggle-row" :class="{ disabled: settings.strategy === 'Maximize' }">
        <div class="toggle-info">
          <span class="label">Infinite Resources</span>
          <span class="sub">Unlock theoretical potential</span>
        </div>
        <div 
          class="custom-toggle" 
          :class="{ active: settings.infiniteResources }"
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
  transition: opacity 0.3s;
}

.setting-item.disabled, .toggle-row.disabled {
  opacity: 0.5;
  pointer-events: none;
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
  font-size: 12px;
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

.select-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.level-select {
  appearance: none;
  background: var(--sys-color-surface-container);
  border: 1px solid var(--sys-color-outline-variant);
  border-radius: 12px;
  padding: 10px 14px;
  font-family: var(--sys-font-family-mono);
  font-size: 14px;
  font-weight: 700;
  color: var(--sys-color-on-surface);
  width: 100%;
  cursor: pointer;
}

.level-select option.milestone {
  font-weight: 900;
  color: var(--sys-color-primary);
}

.level-select option.past {
  opacity: 0.5;
  color: var(--sys-color-on-surface-variant);
}

.select-icon {
  position: absolute;
  right: 14px;
  pointer-events: none;
  opacity: 0.5;
}

.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  cursor: pointer;
  padding-top: 8px;
  border-top: 1px solid var(--sys-color-outline-variant);
  transition: opacity 0.3s;
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

.lock-icon {
  position: absolute;
  right: -6px;
  top: 4px; /* Centered relative to the row/toggle */
  color: var(--sys-color-on-surface-variant);
  opacity: 0.8;
  background: var(--sys-color-surface-container);
  border-radius: 50%;
  padding: 2px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.3);
  pointer-events: none;
}
</style>
