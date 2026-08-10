<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->

<script setup lang="ts">
/**
 * [FEATURE] USEFUL LINKS SETTINGS
 * ----------------------------------------------------------------------------
 * Rationale: Dynamic links portal for official Supercell and Clash Royale resources.
 * Layer: @features/settings
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * Displays a list of external resources with locale-aware URLs matching the user's
 * active language. In non-native environments, it dynamically appends an Android
 * app download link, resolving the latest release filename from GitHub API on mount.
 *
 * **Architectural Context:**
 * - **Layer:** Layer 3 (@features)
 * - **Imports:** Consumes Layer 1 (@core) utilities and Layer 2 (@shared) UI elements.
 * - **Design Pattern:** Delegated interaction using the `v-tactile` directive on
 *   buttons and `useExternalLink` for robust external browsing.
 */
import { computed, onMounted, ref } from "vue";
import { Icon, SettingsCard, vTactile } from "@shared";
import { useSettings } from "../composables/useSettings";
import {
  appVersion,
  getSupercellLocale,
  type ApkReleaseDownload,
  resolveLatestApkRelease,
  useExternalLink,
} from "@core";
import { useNativeBridge } from "@core/services/useNativeBridge";

const props = defineProps<{
  /**
   * Whether the links card should be initially expanded in the settings view.
   *
   * @defaultValue false
   */
  initiallyExpanded?: boolean;
}>();

const { isRefreshing } = useSettings();
const { openExternal } = useExternalLink();
const { isNativeWrapper } = useNativeBridge();

/**
 * Dynamic Android App installer filename resolved from live release metadata.
 * Undefined until a real versioned APK filename is known.
 */
const apkRelease = ref<ApkReleaseDownload>();

/**
 * Fetches the latest release filename from GitHub API during component mounting.
 * Fallback to the default un-suffixed filename on network failure or abort timeout.
 *
 * @sideeffects
 * - Initiates an asynchronous HTTP GET request to the Beta release repository.
 */
onMounted(async () => {
  try {
    const latestRelease = await resolveLatestApkRelease();
    if (latestRelease) apkRelease.value = latestRelease;
  } catch {
    // Keep the fallback filename.
  }
});

/**
 * Locale-aware links array including royaleapi blogs, giveaways, supercell stores, and app download.
 *
 * @remarks
 * Links are dynamically transformed with Supercell-compliant locale codes resolved
 * from browser environment settings via `getSupercellLocale()`.
 *
 * [DECISION LOG]: Locale segment is resolved dynamically once at mount/compute.
 * In addition, the Download Android App link is selectively appended only when
 * `isNativeWrapper` is false, ensuring native context consistency.
 */
const usefulLinks = computed(() => {
  const locale = getSupercellLocale();
  const usefulLinksCollection = [
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

  if (!isNativeWrapper.value && apkRelease.value) {
    usefulLinksCollection.push({
      label: "Download Android App",
      desc: `Install the native companion APK (v${appVersion})`,
      url: apkRelease.value.url,
      icon: "download",
    });
  }

  return usefulLinksCollection;
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
        v-for="usefulLinkRecord in usefulLinks"
        :key="usefulLinkRecord.url"
        class="link-row"
        v-tactile
        @click="openExternal(usefulLinkRecord.url)"
      >
        <div class="link-info">
          <span class="link-label">{{ usefulLinkRecord.label }}</span>
          <span class="link-desc">{{ usefulLinkRecord.desc }}</span>
        </div>
        <img
          v-if="usefulLinkRecord.logo"
          :src="usefulLinkRecord.logo"
          class="link-logo"
          :alt="usefulLinkRecord.label"
          width="18"
          height="18"
          loading="lazy"
        />
        <Icon v-else-if="usefulLinkRecord.icon" :name="usefulLinkRecord.icon" size="18" class="link-icon" />
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
  min-height: var(--sys-space-48); /* 48px Mobile Footprint (Target B.2) */
  padding: var(--sys-space-4) 0; /* Compensating vertical padding */
  user-select: none; /* Text Selection Containment (Target A.3) */
  -webkit-user-select: none;
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
