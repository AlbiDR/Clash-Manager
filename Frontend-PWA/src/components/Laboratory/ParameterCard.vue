<script setup lang="ts">
import { computed } from "vue";
import { type OptimizationSettings } from "../../logic/Laboratory/Laboratory_Types";
import { IMPORTANT_KING_LEVELS } from "../../logic/Laboratory/Laboratory_Tables";
import { Icon } from "@shared";

const props = defineProps<{
  settings: OptimizationSettings;
  currentLevel: number;
}>();

const emit = defineEmits<{
  update: [newSettings: Partial<OptimizationSettings>];
}>();

const setStrategy = (val: "Projection" | "Efficiency") => {
  const updates: Partial<OptimizationSettings> = { strategy: val };
  emit("update", { ...props.settings, ...updates });
};

const handleTargetChange = (e: Event) => {
  const val = parseInt((e.target as HTMLSelectElement).value);
  emit("update", { targetLevel: val });
};

const toggleGemSpending = () => {
  emit("update", { allowGemSpending: !props.settings.allowGemSpending });
};

const filteredLevels = computed(() => {
  return Array.from({ length: 90 }, (_, i) => i + 1).filter(level => {
    // Current and future levels are always shown
    if (level > props.currentLevel) return true;
    // Past levels only shown if they are milestones
    return IMPORTANT_KING_LEVELS.includes(level as any);
  });
});

const baseUrl = import.meta.env.BASE_URL;
</script>

<template>
  <div class="parameter-card glass-panel">
    <h3 class="panel-header">
      <Icon name="gear" size="16" />
      <span>Parameters</span>
    </h3>

    <div class="parameter-grid">
      <!-- Strategy Selector -->
      <div class="parameter-item">
        <label class="parameter-label">Optimization Strategy</label>
        <div class="strategy-selector">
          <button 
            class="strategy-btn" 
            :class="{ active: settings.strategy === 'Projection' }"
            @click="setStrategy('Projection')"
          >
            <span>Level Projection</span>
          </button>
          <button 
            class="strategy-btn" 
            :class="{ active: settings.strategy === 'Efficiency' }"
            @click="setStrategy('Efficiency')"
          >
            <span>Resource Efficiency</span>
          </button>
        </div>
        <div class="strategy-desc">
          <template v-if="settings.strategy === 'Projection'">
            <strong>Goal: Level Projection (Simulation)</strong>
            <p>Best for long-term planning. Simulates the optimal path to reach a specific King Level goal, assuming you can acquire all necessary resources. Toggle <em>Allow Gem Spending</em> to view gem costs vs. free-to-play requirements.</p>
          </template>
          <template v-else>
            <strong>Goal: Resource Efficiency (Limit)</strong>
            <p>Best for immediate progress. Calculates the most efficient way to gain XP using only your currently owned Gold and Cards. Strictly limited by your inventory.</p>
          </template>
        </div>
      </div>

      <!-- Target Level Selector -->
      <div class="parameter-item" v-if="settings.strategy === 'Projection'">
        <label class="parameter-label">Target King Level</label>
        <div class="select-wrapper">
          <select 
            class="level-select" 
            :value="settings.targetLevel || 90" 
            @change="handleTargetChange"
          >
            <option 
              v-for="level in filteredLevels" 
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

      <!-- Gem Spending Toggle -->
      <label class="toggle-row">
        <div class="toggle-info">
          <span class="label">Allow Gem Spending</span>
          <span class="sub">Buy missing cards with gems</span>
        </div>
        <div 
          class="custom-toggle" 
          :class="{ active: settings.allowGemSpending }"
          @click="toggleGemSpending()"
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
  padding: 20px;
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
  margin-bottom: 24px;
}

.parameter-grid {
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.parameter-item {
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition: all 0.3s ease;
}

.parameter-item.disabled {
  opacity: 0.4;
  filter: grayscale(0.5);
  pointer-events: none;
}

.parameter-label {
  font-size: 12px;
  font-weight: 700;
  opacity: 0.6;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.strategy-selector {
  display: flex;
  gap: 4px;
  background: var(--sys-color-surface-container-high);
  padding: 4px;
  border-radius: 14px;
  border: 1px solid var(--sys-color-outline-variant);
}

.strategy-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0;
  padding: 10px 0;
  border: none;
  background: transparent;
  color: var(--sys-color-on-surface);
  font-size: 13px;
  font-weight: 800;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  opacity: 0.5;
  white-space: nowrap;
}

.strategy-btn.active {
  background: var(--sys-color-surface-container-highest);
  box-shadow: var(--sys-elevation-1);
  opacity: 1;
  color: var(--sys-color-primary);
}

.strategy-desc {
  font-size: 11px;
  line-height: 1.4;
  color: var(--sys-color-on-surface-variant);
  background: var(--sys-color-surface-container);
  padding: 10px 12px;
  border-radius: 8px;
  border-left: 3px solid var(--sys-color-primary);
  margin-top: 6px;
  gap: 4px;
  display: flex;
  flex-direction: column;
}

.strategy-desc strong {
  color: var(--sys-color-primary);
  opacity: 0.9;
  font-weight: 750;
}

.strategy-desc p {
  opacity: 0.8;
  margin: 0;
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
  padding: 12px 14px;
  font-family: var(--sys-font-family-mono);
  font-size: 14px;
  font-weight: 700;
  color: var(--sys-color-on-surface);
  width: 100%;
  cursor: pointer;
  transition: border-color 0.2s;
}

.level-select:focus {
  outline: none;
  border-color: var(--sys-color-primary);
}

.level-select option.milestone {
  font-weight: 900;
  color: var(--sys-color-primary);
}

.level-select option.past {
  opacity: 0.5;
}

.select-icon {
  position: absolute;
  right: 14px;
  pointer-events: none;
  opacity: 0.4;
}

.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  cursor: pointer;
  padding: 12px 0;
  border-top: 1px solid var(--sys-color-outline-variant);
  transition: opacity 0.3s;
}

.toggle-row.disabled {
  opacity: 0.3;
  pointer-events: none;
}

.toggle-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.toggle-info .label {
  font-size: 14px;
  font-weight: 750;
  color: var(--sys-color-on-surface);
}

.toggle-info .sub {
  font-size: 10px;
  font-weight: 600;
  opacity: 0.5;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.custom-toggle {
  width: 44px;
  height: 24px;
  background: var(--sys-color-surface-container-highest);
  border-radius: 20px;
  position: relative;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  flex-shrink: 0;
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
  box-shadow: 0 2px 5px rgba(0,0,0,0.2);
}

.custom-toggle.active .toggle-nob {
  transform: translateX(20px);
}

</style>
