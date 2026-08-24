<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import ClashRoyaleIcon from "./ClashRoyaleIcon.vue";
import { useExternalLink } from "@core/services/useExternalLink";
import { useHaptics } from "@shared/composables/useHaptics";

/**
 * [UTIL] CARD ACTIONS
 * Atomic component for player-specific action buttons (RoyaleAPI, Open Game).
 * Deduplicated from MemberCard and RecruitCard.
 *
 * @remarks
 * [DECISION LOG] Haptic feedback integrated via useHaptics to ensure tactile
 * consistency for global card actions across the Android WebView shell.
 */
const props = defineProps<{
  /** Player Tag */
  id: string;
  /** Whether the parent is in a refreshing/loading state */
  loading?: boolean;
  /** Whether to use a compact layout (smaller font/icons) */
  compact?: boolean;
}>();

const { openExternal, openInGame } = useExternalLink();
const haptics = useHaptics();

const iconSize = props.compact ? 14 : 16;

/**
 * [DECISION LOG] BROKERED TACTILE FEEDBACK
 * Triggers a standard tap haptic before delegating to the external link service.
 */
function handleOpenExternal() {
  haptics.tap();
  openExternal(`https://royaleapi.com/player/${props.id}`);
}

/**
 * [DECISION LOG] BROKERED TACTILE FEEDBACK
 * Triggers a standard tap haptic before attempting to open the game deep-link.
 */
function handleOpenInGame() {
  haptics.tap();
  openInGame(props.id);
}
</script>

<template>
  <div class="card-actions-wrapper">
    <template v-if="loading">
      <div
        class="sk-button-m skeleton-anim"
        style="flex: 1"
      />
      <div
        class="sk-button-m skeleton-anim"
        style="flex: 1"
      />
    </template>
    <template v-else>
      <button
        class="btn-action"
        :class="{ compact: compact }"
        aria-label="View on RoyaleAPI"
        @click.stop="handleOpenExternal"
      >
        <img
          src="https://cdn.royaleapi.com/static/img/branding/royaleapi-logo-128.png"
          :width="iconSize"
          :height="iconSize"
          alt="RoyaleAPI"
          class="royaleapi-logo"
          loading="lazy"
        >
        <span>RoyaleAPI</span>
      </button>
      <button
        class="btn-action primary"
        :class="{ compact: compact }"
        aria-label="Open in Game"
        @click.stop="handleOpenInGame"
      >
        <ClashRoyaleIcon
          :size="iconSize + 4"
          class="clashroyale-icon"
        />
        <span>Open Game</span>
      </button>
    </template>
  </div>
</template>

<style scoped>
.card-actions-wrapper {
  display: flex;
  gap: var(--sys-space-8);
  width: 100%;
}

.royaleapi-logo {
  object-fit: contain;
  filter: grayscale(1) opacity(0.6);
  transition: filter var(--sys-motion-duration-200) var(--sys-motion-spring);
}

.btn-action:hover .royaleapi-logo {
  filter: grayscale(0) opacity(1);
}

.clashroyale-icon {
  filter: grayscale(1) opacity(0.6);
  transform: translateZ(0);
  will-change: filter;
  transition: filter var(--sys-motion-duration-200) var(--sys-motion-spring),
              transform var(--sys-motion-duration-200) var(--sys-motion-spring);
}

.btn-action:hover .clashroyale-icon {
  filter: grayscale(0) opacity(1);
}
</style>
