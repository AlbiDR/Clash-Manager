<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import { computed } from "vue";
import { Icon, SettingsCard, vTactile } from "@shared";
import { useSettings } from "../composables/useSettings";
import { useExternalLink, getSupercellLocale } from "@core";

defineProps<{
  initiallyExpanded?: boolean;
}>();

const { isRefreshing } = useSettings();
const { openExternal } = useExternalLink();

// Locale-aware: Supercell URLs include a locale segment that must match the
// user's browser language. Resolved once at mount via getSupercellLocale().
const usefulLinks = computed(() => {
  const locale = getSupercellLocale();
  return [
    {
      label: "RoyaleAPI Blog",
      desc: "Latest news and articles about Clash Royale",
      url: "https://royaleapi.com/blog",
      icon: "external-link",
    },
    {
      label: "RoyaleAPI Giveaway",
      desc: "Claim free in-game cosmetics and perks",
      url: "https://royaleapi.com/free",
      icon: "external-link",
    },
    {
      label: "Supercell ID Rewards",
      desc: "Access your Supercell ID rewards and benefits",
      url: `https://id.supercell.com/${locale}/clashroyale/`,
      icon: "external-link",
    },
    {
      label: "Clash Royale Store",
      desc: "Official Supercell store specials and deals",
      url: `https://store.supercell.com/${locale}/clashroyale`,
      icon: "external-link",
    },
    {
      label: "Clash Manager on GitHub",
      desc: "Contribute to the open source project",
      url: "https://github.com/AlbiDR/Clash-Manager",
      icon: "github",
    },
  ];
});
</script>

<template>
  <SettingsCard
    title="Useful Links"
    icon="globe"
    :loading="isRefreshing"
    :initially-expanded="initiallyExpanded"
  >
    <div class="links-list">
      <button
        v-for="link in usefulLinks"
        :key="link.url"
        class="link-row"
        v-tactile
        @click="openExternal(link.url)"
      >
        <div class="link-info">
          <span class="link-label">{{ link.label }}</span>
          <span class="link-desc">{{ link.desc }}</span>
        </div>
        <Icon :name="link.icon" size="18" class="link-icon" />
      </button>
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
  width: 100%;
  /* button resets */
  appearance: none;
  background: none;
  border: none;
  font: inherit;
  color: inherit;
  text-align: left;
  /* shared */
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
