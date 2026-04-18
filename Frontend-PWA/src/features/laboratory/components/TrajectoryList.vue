// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

<script setup lang="ts">
/**
 * ============================================================================
 * [COMPONENT] TRAJECTORY LIST
 * ----------------------------------------------------------------------------
 * Renders the recommended upgrade path for the Laboratory feature.
 *
 * @remarks
 * **Performance Strategy:**
 * - **Progressive Rendering:** Utilizes `useProgressiveList` to time-slice the
 *   injection of trajectory items into the DOM. This maintains 60FPS even
 *   when a simulation results in hundreds of recommended actions.
 * - **Manual Override Removal:** Replaces the legacy "Show More" button with
 *   automated background rendering.
 *
 * @param actions - The full list of upgrade actions from the simulation.
 * @param getTrajectoryMemoKeys - Function to generate stable memoization keys.
 * ============================================================================
 */
import { toRefs } from 'vue';
import { Icon } from "@shared";
import { useProgressiveList } from "@core/services/useProgressiveList";
import TrajectoryItem from "./TrajectoryItem.vue";
import type { UpgradeAction } from "../logic";

const props = defineProps<{
  actions: UpgradeAction[];
  getTrajectoryMemoKeys: (upgrade: UpgradeAction) => any[];
}>();

const { actions } = toRefs(props);

// [PERF] Progressive Rendering: Matches the previous initial limit (20)
// but automatically hydrates the rest of the list during idle frames.
const { visibleItems } = useProgressiveList(actions, 20);

</script>

<template>
  <div class="trajectory-section">
    <h3 class="section-title">
      <Icon name="trend_up" size="18" />
      <span>Recommended Trajectory</span>
    </h3>

    <div class="trajectory-list">
      <TrajectoryItem
        v-for="(upgrade, index) in visibleItems"
        :key="`${upgrade.cardName}-${upgrade.targetLevel}-${index}`"
        v-memo="getTrajectoryMemoKeys(upgrade)"
        :upgrade="upgrade"
        :index="index"
      />
    </div>
  </div>
</template>

<style scoped>
.section-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 18px;
  font-weight: 900;
  margin: 12px 0;
  padding: 0 8px;
}

.trajectory-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
