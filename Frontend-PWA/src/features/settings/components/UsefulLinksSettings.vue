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
 * active language. In non-native environments, it appends an Android app download
 * link that targets the latest versioned APK resolved from release metadata.
 *
 * **Architectural Context:**
 * - **Layer:** Layer 3 (@features)
 * - **Imports:** Consumes Layer 1 (@core) utilities and Layer 2 (@shared) UI elements.
 * - **Design Pattern:** Row presentation is delegated to the Layer 2 `LinkRow`
 *   primitive (which owns the tactile brokering and the 48px touch footprint); this
 *   module owns only the link corpus and `useExternalLink` navigation.
 */
import { computed, onMounted, ref } from "vue";
import { LinkRow, SettingsCard } from "@shared";
import { useSettings } from "../composables/useSettings";
import {
  appVersion,
  getSupercellLocale,
  type ApkReleaseDownload,
  resolveLatestApkRelease,
  useExternalLink,
} from "@core";
import { useNativeBridge } from "@core/services/useNativeBridge";

defineProps<{
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
 * Android App installer target resolved from the core APK release service.
 * Undefined until the component mount lifecycle has completed.
 */
const apkRelease = ref<ApkReleaseDownload>();

/**
 * Resolves the latest versioned APK during component mounting.
 *
 * @sideeffects
 * - Updates local reactive state for the optional web-only Android download link.
 */
onMounted(async () => {
  try {
    const latestRelease = await resolveLatestApkRelease();
    if (latestRelease) apkRelease.value = latestRelease;
  } catch {
    // Keep the optional web-only download link hidden if resolution unexpectedly fails.
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
      <LinkRow
        v-for="usefulLinkRecord in usefulLinks"
        :key="usefulLinkRecord.url"
        :label="usefulLinkRecord.label"
        :description="usefulLinkRecord.desc"
        :icon="usefulLinkRecord.icon"
        :logo="usefulLinkRecord.logo"
        @click="openExternal(usefulLinkRecord.url)"
      />
    </div>
  </SettingsCard>
</template>

<style scoped>
/* Row presentation now lives in @shared/ui/LinkRow.vue (SSOT). This module retains
   only the list rhythm, which is the one concern it still owns. */
.links-list {
  display: flex;
  flex-direction: column;
  gap: var(--sys-space-16);
}
</style>
