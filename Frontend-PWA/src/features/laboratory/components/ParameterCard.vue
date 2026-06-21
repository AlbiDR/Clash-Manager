<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
/**
 * COMPONENT: ParameterCard
 *
 * @remarks
 * Manages simulation parameters for the Laboratory engine.
 * Following Layer 3 (@features) isolation rules.
 */
import { Icon, SettingRow, BaseSelect } from "@shared";
import { computed } from "vue";
import { type OptimizationSettings, type OptimizationResult } from "../logic";
import { IMPORTANT_KING_LEVELS, KING_LEVEL_MAX } from "@core";

/**
 * [DECISION LOG] Prop types are strictly enforced to satisfy the CleanStack
 * Architecture's mandate to excise 'any' pathogens at component boundaries.
 */
const props = defineProps<{
  settings: OptimizationSettings;
  currentLevel: number;
  // [THREAT:] External simulation result is un-trusted. Replacing implicit 'any'
  // with 'OptimizationResult' to ensure structural contract enforcement.
  operation?: OptimizationResult;
}>();

const emit = defineEmits<{
  update: [newSettings: Partial<OptimizationSettings>];
}>();

const setStrategy = (strategyType: "Level Projection" | "Resource Efficiency") => {
  const updates: Partial<OptimizationSettings> = { strategy: strategyType };
  emit("update", { ...props.settings, ...updates });
};

const toggleGemSpending = () => {
  emit("update", { allowGemSpending: !props.settings.allowGemSpending });
};

const levelOptions = computed(() => {
  return Array.from({ length: KING_LEVEL_MAX }, (_, i) => i + 1)
    .filter(level => {
      // Current and future levels are always shown
      if (level >= props.currentLevel) return true;
      // Past levels only shown if they are milestones
      return IMPORTANT_KING_LEVELS.includes(level);
    })
    .map(level => {
      const isMilestone = IMPORTANT_KING_LEVELS.includes(level);
      const isPast = level <= props.currentLevel;
      return {
        label: `Level ${String(level).padStart(2, '0')} ${isMilestone ? '•' : ''}`,
        value: level,
        disabled: level <= props.currentLevel,
        class: `${isMilestone ? 'milestone' : ''} ${isPast ? 'past' : ''}`.trim()
      };
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
            :class="{ active: settings.strategy === 'Level Projection' }"
            @click="setStrategy('Level Projection')"
          >
            <span>Level Projection</span>
          </button>
          <button 
            class="strategy-btn" 
            :class="{ active: settings.strategy === 'Resource Efficiency' }"
            @click="setStrategy('Resource Efficiency')"
          >
            <span>Resource Efficiency</span>
          </button>
        </div>
        <div class="strategy-desc">
          <template v-if="settings.strategy === 'Level Projection'">
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
      <div class="parameter-item" v-if="settings.strategy === 'Level Projection'">
        <label class="parameter-label">Target King Level</label>
        <BaseSelect
          :model-value="settings.targetLevel || KING_LEVEL_MAX"
          :options="levelOptions"
          @update:model-value="(val) => emit('update', { targetLevel: val })"
        />
        
        <div v-if="operation && settings.targetLevel && operation.projectedKingLevel < settings.targetLevel" class="limit-warning">
          <Icon name="warning" size="12" />
          <span>Cannot reach Level {{ settings.targetLevel }}. Roster maxes out at {{ operation.projectedKingLevel }}.</span>
        </div>
      </div>

      <!-- Gem Spending Toggle -->
      <SettingRow
        label="Allow Gem Spending"
        description="Buy missing cards with gems"
        :active="settings.allowGemSpending"
        class="parameter-toggle"
        @click="toggleGemSpending()"
      />
    </div>
  </div>
</template>

<style scoped>
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
  border-radius: var(--sys-shape-corner-large);
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
  border-radius: var(--sys-shape-corner-medium);
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
  border-radius: var(--sys-shape-corner-small);
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

.parameter-toggle {
  padding: 12px 0;
  border-top: 1px solid var(--sys-color-outline-variant);
}

.limit-warning {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  padding: 8px 10px;
  background: rgba(var(--sys-color-error-rgb), 0.1);
  border: 1px solid rgba(var(--sys-color-error-rgb), 0.2);
  border-radius: var(--sys-shape-corner-small);
  color: var(--sys-color-error);
  font-size: 11px;
  font-weight: 700;
}

</style>
