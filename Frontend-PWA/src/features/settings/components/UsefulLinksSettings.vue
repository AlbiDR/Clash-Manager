<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import { Icon, SettingsCard, vTactile } from "@shared";
import { useSettings } from "../composables/useSettings";

defineProps<{
  initiallyExpanded?: boolean;
}>();

const { isRefreshing } = useSettings();
</script>

<template>
  <SettingsCard
    title="Useful Links"
    icon="globe"
    :loading="isRefreshing"
    :initially-expanded="initiallyExpanded"
  >
    <div class="links-list">
      <a
        href="https://royaleapi.com/blog"
        target="_blank"
        rel="noopener noreferrer"
        class="link-row"
        v-tactile
      >
        <div class="link-info">
          <span class="link-label">RoyaleAPI News</span>
          <span class="link-desc">Latest news and articles about Clash Royale</span>
        </div>
        <Icon name="external-link" size="18" class="link-icon" />
      </a>

      <a
        href="https://royaleapi.com/free"
        target="_blank"
        rel="noopener noreferrer"
        class="link-row"
        v-tactile
      >
        <div class="link-info">
          <span class="link-label">Supercell ID Rewards</span>
          <span class="link-desc">Claim free in-game cosmetics and perks</span>
        </div>
        <Icon name="external-link" size="18" class="link-icon" />
      </a>

      <a
        href="https://store.supercell.com/it/clashroyale#storespecials"
        target="_blank"
        rel="noopener noreferrer"
        class="link-row"
        v-tactile
      >
        <div class="link-info">
          <span class="link-label">Supercell Store (CR)</span>
          <span class="link-desc">Exclusive discounts and store special deals</span>
        </div>
        <Icon name="external-link" size="18" class="link-icon" />
      </a>

      <div class="link-row disabled">
        <div class="link-info">
          <span class="link-label">Rewards Page</span>
          <span class="link-desc">Special rewards redemption hub (TBD)</span>
        </div>
        <span class="tbd-badge">TBD</span>
      </div>

      <a
        href="https://github.com/AlbiDR/Clash-Manager"
        target="_blank"
        rel="noopener noreferrer"
        class="link-row"
        v-tactile
      >
        <div class="link-info">
          <span class="link-label">GitHub Repository</span>
          <span class="link-desc">Contribute to the open source project</span>
        </div>
        <Icon name="github" size="18" class="link-icon" />
      </a>
    </div>
  </SettingsCard>
</template>

<style scoped>
.links-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.link-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  text-decoration: none;
  cursor: pointer;
  padding: 4px 0;
  transition: all var(--sys-motion-duration-200) var(--sys-motion-spring);
}

.link-row:not(.disabled):active {
  transform: scale(0.98);
}

.link-row.disabled {
  pointer-events: none;
  opacity: 0.5;
}

.link-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}

.link-label {
  font-weight: 800;
  font-size: 15px;
  color: var(--sys-color-on-surface);
  transition: color 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.link-desc {
  font-size: 13px;
  color: var(--sys-color-outline);
  opacity: 0.8;
}

.link-icon {
  color: var(--sys-color-outline);
  opacity: 0.6;
  transition: opacity 0.25s, color 0.25s;
}

.link-row:hover .link-icon {
  color: var(--sys-color-primary);
  opacity: 1;
}

.tbd-badge {
  font-size: 9px;
  font-weight: 900;
  color: var(--sys-color-primary);
  background: var(--sys-color-surface-container-highest);
  padding: 2px 6px;
  border-radius: 4px;
  letter-spacing: 0.05em;
}
</style>
