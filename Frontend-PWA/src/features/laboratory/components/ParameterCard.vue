<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
/**
 * COMPONENT: ParameterCard
 *
 * @remarks
 * Manages simulation parameters and strategy selection for the Laboratory engine.
 * Handles the configuration of optimization thresholds, level milestones, and gem spending toggles.
 *
 * **Architectural Context:**
 * - **Layer:** Layer 3 Features (`@features`)
 * - **Satisfaction:** Satisfies ADR Section III: Data Flow and ADR Section VII: Naming Conventions.
 * - **Interface Boundaries:** Excises any implicit `any` pathogens by enforcing typed properties and emissions.
 */
import { Icon, SettingRow, BaseSelect, BaseSegmentedControl, vTactile } from "@shared";
import { computed } from "vue";
import { type OptimizationSettings, type OptimizationResult } from "../logic";
import { IMPORTANT_KING_LEVELS, KING_LEVEL_MAX } from "@core";

/**
 * Component properties interface representing optimization parameters.
 *
 * @remarks
 * - **settings**: The current active optimization strategy and settings object.
 * - **currentLevel**: The player's current King Level, used to disable/filter past non-milestone levels.
 * - **operation**: The optional transient optimization output, checked for feasibility warnings.
 *
 * [DECISION LOG] Prop types are strictly enforced to satisfy the CleanStack
 * Architecture's mandate to excise 'any' pathogens at component boundaries.
 */
const props = defineProps<{
  /** Active optimization strategy configurations */
  settings: OptimizationSettings;
  /** Player's baseline account level */
  currentLevel: number;
  /**
   * Transient simulation execution result
   * [THREAT:] External simulation result is un-trusted. Replacing implicit 'any'
   * with 'OptimizationResult' to ensure structural contract enforcement.
   */
  operation?: OptimizationResult;
}>();

/**
 * Component emission descriptors.
 *
 * @remarks
 * Defines structured events transmitted upwards to parent containers to trigger settings updates.
 *
 * @param update - Emits a partial settings object when parameters are updated by user actions.
 */
const emit = defineEmits<{
  update: [newSettings: Partial<OptimizationSettings>];
}>();

const levelOptions = computed(() => {
  return Array.from({ length: KING_LEVEL_MAX }, (_, levelIndex) => levelIndex + 1)
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

</script>

<template>
  <div class="parameter-card glass-panel" data-bone="ParameterCard.panel">
    <h3 class="panel-header" data-bone="ParameterCard.header">
      <Icon name="gear" size="16" />
      <span>Parameters</span>
    </h3>

    <div class="parameter-grid">
      <!-- Strategy Selector -->
      <div class="parameter-item">
        <label class="parameter-label" data-bone="ParameterCard.label">Optimization Strategy</label>
        <BaseSegmentedControl
          :model-value="settings.strategy"
          :options="[
            { label: 'Level Projection', value: 'Level Projection' },
            { label: 'Resource Efficiency', value: 'Resource Efficiency' }
          ]"
          @update:model-value="(strategyValue) => emit('update', { strategy: strategyValue })"
        />
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
          @update:model-value="(levelValue) => emit('update', { targetLevel: levelValue })"
        />
        
        <div v-if="operation && settings.targetLevel && operation.projectedKingLevel < settings.targetLevel" class="limit-warning">
          <Icon name="warning" size="12" />
          <span>Cannot reach Level {{ settings.targetLevel }}. Roster maxes out at {{ operation.projectedKingLevel }}.</span>
        </div>
      </div>

      <!-- Gem Spending Toggle -->
      <SettingRow
        v-tactile
        label="Allow Gem Spending"
        description="Buy missing cards with gems"
        :active="settings.allowGemSpending"
        class="parameter-toggle"
        @click="emit('update', { allowGemSpending: !settings.allowGemSpending })"
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
