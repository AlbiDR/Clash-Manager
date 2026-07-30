<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { Icon, SettingsCard, vTactile } from "@shared";
import { useSettings } from "../composables/useSettings";
import { useExternalLink, getSupercellLocale, appVersion } from "@core";
import { useNativeBridge } from "@core/services/useNativeBridge";

defineProps<{
  initiallyExpanded?: boolean;
}>();

const { isRefreshing } = useSettings();
const { openExternal } = useExternalLink();
const { isNativeWrapper } = useNativeBridge();

// APK/release/latest.json carries a `+<buildNumber>` suffix the plain
// `clashmanager-v<version>.apk` guess can no longer find. Resolved once at mount;
// the unsuffixed guess below is the fallback if the fetch fails.
const apkFilename = ref(`clashmanager-v${appVersion}.apk`);
onMounted(async () => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(
      "https://raw.githubusercontent.com/AlbiDR/Clash-Manager/Beta/APK/release/latest.json",
      { signal: controller.signal },
    );
    clearTimeout(timeoutId);
    if (!response.ok) return;
    const latest = (await response.json()) as { filename?: string };
    if (latest.filename) apkFilename.value = latest.filename;
  } catch {
    // Keep the fallback filename.
  }
});

// Locale-aware: Supercell URLs include a locale segment that must match the
// user's browser language. Resolved once at mount via getSupercellLocale().
const usefulLinks = computed(() => {
  const locale = getSupercellLocale();
  const links = [
    {
      label: "RoyaleAPI Blog",
      desc: "Latest news and articles about Clash Royale",
      url: "https://royaleapi.com/blog",
      logo: "https://cdn.royaleapi.com/static/img/branding/royaleapi-logo-128.png",
    },
    {
      label: "RoyaleAPI Giveaway",
      desc: "Claim free in-game cosmetics and perks",
      url: "https://royaleapi.com/free",
      logo: "https://cdn.royaleapi.com/static/img/branding/royaleapi-logo-128.png",
    },
    {
      label: "Supercell ID Rewards",
      desc: "Access your Supercell ID rewards and benefits",
      url: `https://id.supercell.com/${locale}/clashroyale/`,
      logo: "https://store.supercell.com/public/idr-icon-KFYSWK6N.svg",
    },
    {
      label: "Clash Royale Store",
      desc: "Official Supercell store specials and deals",
      url: `https://store.supercell.com/${locale}/clashroyale`,
      logo: "https://store.supercell.com/public/icon-nav-supercell-store-HDDWMNKU.png",
    },
    {
      label: "Clash Manager on GitHub",
      desc: "Contribute to the open source project",
      url: "https://github.com/AlbiDR/Clash-Manager",
      icon: "github",
    },
  ];

  if (!isNativeWrapper.value) {
    links.push({
      label: "Download Android App",
      desc: `Install the native companion APK (v${appVersion})`,
      url: `https://github.com/AlbiDR/Clash-Manager/raw/refs/heads/Beta/APK/release/${apkFilename.value}`,
      icon: "download",
    });
  }

  return links;
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
        <img v-if="link.logo" :src="link.logo" class="link-logo" :alt="link.label" />
        <Icon v-else-if="link.icon" :name="link.icon" size="18" class="link-icon" />
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

.link-logo {
  width: 18px;
  height: 18px;
  object-fit: contain;
  filter: grayscale(1) opacity(0.6);
  transition: opacity 0.25s, filter 0.25s;
}

.link-row:hover .link-logo {
  filter: grayscale(0) opacity(1);
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
