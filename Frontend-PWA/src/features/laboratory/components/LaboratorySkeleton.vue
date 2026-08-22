<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import { computed } from "vue";
import { getBone } from "@core/theme/bones";

/**
 * LABORATORY SKELETON
 *
 * perfectly representative placeholder matching the Dashboard Grid
 * configuration of the Laboratory view.
 *
 * @remarks
 * Panel header/label/pill widths are read from `bones.generated.json`, a
 * build-time capture of the real Vault/Parameter/Summary/Trajectory panel
 * DOM geometry (see `capture_skeletons.ts`), instead of the hand-authored
 * inline pixel literals this file previously carried.
 */
const px = (rect: { width?: number; height?: number } | undefined, fallback: { width?: number; height?: number }) => ({
  width: `${rect?.width ?? fallback.width}px`,
  height: rect?.height !== undefined || fallback.height !== undefined
    ? `${rect?.height ?? fallback.height}px`
    : undefined,
});

const vaultHeader = computed(() => px(getBone("VaultCard", "header"), { width: 80 }));
const parameterHeader = computed(() => px(getBone("ParameterCard", "header"), { width: 90 }));
const parameterLabel = computed(() => px(getBone("ParameterCard", "label"), { width: 120 }));
const summaryPlayerName = computed(() => px(getBone("SummaryCard", "playerName"), { width: 160, height: 24 }));
const summaryStatusBadge = computed(() => px(getBone("SummaryCard", "statusBadge"), { width: 70, height: 44 }));
const summaryLevelBadge = computed(() => px(getBone("SummaryCard", "levelBadge"), { width: 100, height: 50 }));
const trajectoryTitle = computed(() => px(getBone("TrajectoryList", "title"), { width: 180, height: 18 }));
const trajectoryItemName = computed(() => px(getBone("TrajectoryItem", "name"), { width: 140, height: 16 }));
const trajectoryLevelPill = computed(() => px(getBone("TrajectoryItem", "levelPill"), { width: 50, height: 20 }));
</script>

<template>
  <div class="laboratory-skeleton">
    <div class="dashboard-grid">
      <!-- 1. The Vault & Settings (Sidebar Grid) -->
      <div class="dashboard-sidebar">
        
        <!-- Vault Skeleton -->
        <div class="sk-panel glass-panel skeleton-anim">
          <div class="sk-panel-header">
            <div class="sk-icon-dot"></div>
            <div class="sk-text-line-m" :style="{ width: vaultHeader.width }"></div>
          </div>
          <div class="sk-grid-2">
            <div class="sk-res-col"><div class="sk-label-box"></div><div class="sk-input"></div></div>
            <div class="sk-res-col"><div class="sk-label-box"></div><div class="sk-input"></div></div>
          </div>
          <div class="sk-wc-section">
            <div class="sk-label-box" style="width: 100px;"></div>
             <div class="sk-wc-row">
               <div class="sk-wc-col" v-for="i in 5" :key="i">
                 <div class="sk-box" style="width: 32px; height: 32px; border-radius: 6px;"></div>
                 <div class="sk-input" style="height: 28px; width: 100%;"></div>
               </div>
             </div>
          </div>
        </div>

        <!-- Parameters Skeleton -->
        <div class="sk-panel glass-panel skeleton-anim" style="animation-delay: 0.1s;">
          <div class="sk-panel-header">
            <div class="sk-icon-dot"></div>
            <div class="sk-text-line-m" :style="{ width: parameterHeader.width }"></div>
          </div>
          <div class="sk-vstack">
            <div class="sk-label-box" :style="{ width: parameterLabel.width }"></div>
            <div class="sk-button-m" style="height: 36px;"></div>
            <div class="sk-input" style="height: 80px; border-radius: 8px;"></div>
            
            <div class="sk-label-box" style="width: 100px; margin-top: 8px;"></div>
            <div class="sk-input" style="height: 44px;"></div>

            <div class="sk-toggle-row">
               <div class="sk-vstack" style="gap: 4px;">
                 <div class="sk-text-line-m" style="width: 130px;"></div>
                 <div class="sk-label-box" style="width: 90px;"></div>
               </div>
               <div class="sk-pill" style="width: 44px; height: 24px;"></div>
            </div>
          </div>
        </div>

      </div>

      <!-- 2. Result Summary Skeleton -->
      <div class="sk-panel glass-panel skeleton-anim" style="animation-delay: 0.2s;">
        <div class="sk-summary-header">
          <div class="sk-vstack">
            <div class="sk-text-line-m" :style="{ width: summaryPlayerName.width, height: summaryPlayerName.height }"></div>
            <div class="sk-label-box" style="width: 80px;"></div>
          </div>
          <div class="sk-pill" :style="{ width: summaryStatusBadge.width, height: summaryStatusBadge.height, borderRadius: '12px' }"></div>
        </div>
        <div class="sk-label-box" style="width: 100px; margin-top: 16px; margin-bottom: 8px;"></div>
        <div class="sk-progression-row">
           <div class="sk-input" :style="{ height: summaryLevelBadge.height, width: summaryLevelBadge.width, borderRadius: '14px' }"></div>
           <div class="sk-box" style="width: 24px; height: 24px; border-radius: 50%;"></div>
           <div class="sk-input" :style="{ height: summaryLevelBadge.height, width: summaryLevelBadge.width, borderRadius: '14px' }"></div>
        </div>

        <div class="sk-label-box" style="width: 120px; margin-top: 24px; margin-bottom: 8px;"></div>
        <div class="sk-grid-3">
           <div class="sk-input" style="height: 60px; border-radius: 16px;" v-for="i in 3" :key="i"></div>
        </div>
      </div>

      <!-- 3. Trajectory List Skeleton -->
      <div class="trajectory-section skeleton-anim" style="animation-delay: 0.3s;">
        <div class="section-title">
          <div class="sk-icon-dot" style="width: 18px; height: 18px;"></div>
          <div class="sk-text-line-m" :style="{ width: trajectoryTitle.width, height: trajectoryTitle.height }"></div>
        </div>
        <div class="sk-trajectory-list">
          <div class="sk-traj-item" v-for="i in 3" :key="i">
            <div class="sk-traj-info">
              <div class="sk-text-line-m" :style="{ width: trajectoryItemName.width, height: trajectoryItemName.height }"></div>
              <div class="sk-traj-row">
                 <div class="sk-pill" :style="{ width: trajectoryLevelPill.width, height: trajectoryLevelPill.height, borderRadius: '6px' }"></div>
                 <div class="sk-label-box" style="width: 60px;"></div>
              </div>
              <div class="sk-pill" style="width: 80px; height: 24px; border-radius: 6px; margin-top: 4px;"></div>
            </div>
            <div class="sk-cost-stack">
              <div class="sk-value-box" style="width: 50px;"></div>
              <div class="sk-value-box" style="width: 70px;"></div>
              <div class="sk-value-box" style="width: 60px; height: 10px;"></div>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
.laboratory-skeleton {
  padding-bottom: 120px;
}

.dashboard-grid {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 0 4px;
}

.dashboard-sidebar {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}

@media (min-width: 640px) {
  .dashboard-sidebar {
    grid-template-columns: 1fr 1fr;
  }
}

.glass-panel {
  background: var(--sys-color-surface-container);
  border-radius: var(--sys-shape-corner-l);
  border: 1px solid rgba(128, 128, 128, 0.05);
  padding: 18px;
  display: flex;
  flex-direction: column;
}

.sk-panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 24px;
}

.sk-grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.sk-grid-3 {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

@media (max-width: 640px) {
  .sk-grid-3 {
    grid-template-columns: 1fr;
  }
}

.sk-res-col {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sk-wc-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-top: 16px;
  border-top: 1px solid var(--sys-color-outline-variant);
  margin-top: 24px;
}

.sk-wc-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.sk-wc-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 50px;
}

.sk-vstack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sk-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  border-top: 1px solid var(--sys-color-outline-variant);
  margin-top: 8px;
}

.sk-summary-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.sk-progression-row {
  display: flex;
  align-items: center;
  gap: 24px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 12px 0;
  padding: 0 8px;
}

.sk-trajectory-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sk-traj-item {
  display: flex;
  align-items: center;
  gap: 16px;
  background: var(--sk-fill);
  border: 1px solid var(--sys-color-outline-variant);
  border-radius: var(--sys-shape-corner-large);
  padding: 14px 18px;
}

.sk-traj-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sk-traj-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.sk-cost-stack {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  min-width: 80px;
}
</style>
