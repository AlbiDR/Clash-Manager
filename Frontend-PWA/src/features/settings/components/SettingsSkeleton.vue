<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->

<script setup lang="ts">
import { computed } from "vue";
import { SkeletonSettingsCard } from "@shared";
import { useAppSettings } from "@core/services/useAppSettings";

/**
 * SETTINGS SKELETON (Layer 3)
 *
 * @remarks
 * **Architectural Context:**
 * - **Layer:** Layer 3 (@features/settings)
 * - **Role:** Loading placeholder for the whole Settings column.
 *
 * [DECISION LOG] THE WHOLE COLUMN, NOT ONE CARD:
 * ConsoleLayout renders `skeletonCount` copies of a single card, which was the
 * right shape while Settings was a flat list. It is grouped now, and the two
 * group headings occupy real vertical space, so a flat run of cards would hand
 * back roughly 70px on hydration and the column would jump. This renders the
 * grouped structure once, as one skeleton, so the placeholder and the real
 * column have the same shape as well as the same number of rows.
 *
 * [DECISION LOG] THE HEADINGS ARE DRAWN, NOT SPELLED:
 * A heading placeholder is a bar of the same height rather than the real word.
 * A skeleton that already reads "Preferences" invites the eye to start reading
 * a screen that is not ready yet.
 */

const { modules } = useAppSettings();

/** Cards in the System group, which gains one when Backend Refresh is enabled. */
const systemCardCount = computed(() => (modules.backendRefresher ? 5 : 4));

/** Cards in the Preferences group: Appearance, Notifications, Features, Display. */
const PREFERENCE_CARD_COUNT = 4;
</script>

<template>
  <div class="settings-skeleton">
    <section class="settings-group">
      <SkeletonSettingsCard :index="0" />
    </section>

    <section class="settings-group">
      <div class="sk-group-label skeleton-anim" />
      <SkeletonSettingsCard
        v-for="cardIndex in PREFERENCE_CARD_COUNT"
        :key="`preference-${cardIndex}`"
        :index="cardIndex"
      />
    </section>

    <section class="settings-group">
      <div class="sk-group-label skeleton-anim" />
      <SkeletonSettingsCard
        v-for="cardIndex in systemCardCount"
        :key="`system-${cardIndex}`"
        :index="cardIndex"
      />
    </section>
  </div>
</template>

<style scoped>
/* Mirrors `.settings-content` in SettingsView, which owns the two custom
   properties both read. */
.settings-skeleton {
  display: flex;
  flex-direction: column;
  gap: var(--console-group-gap);
}

.settings-group {
  display: flex;
  flex-direction: column;
  gap: var(--console-gap);
}

/* Occupies exactly what `.group-label` does: the same typescale step at the
   same pinned leading, the same margins, and a width that suggests a word
   rather than spelling one. Changing either side's font-size or margins
   without the other reintroduces a shift at hydration. */
.sk-group-label {
  width: var(--sys-space-76);
  height: calc(var(--sys-typescale-label-md) * var(--sys-leading-none));
  margin: var(--sys-space-4) 0 var(--sys-space-2) var(--sys-space-4);
  border-radius: var(--sys-shape-corner-extra-small);
  background: var(--sk-fill);
}
</style>
