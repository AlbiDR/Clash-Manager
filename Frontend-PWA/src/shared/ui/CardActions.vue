<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import Icon from "./Icon.vue";
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
      <div class="sk-button-m skeleton-anim" style="flex: 1"></div>
      <div class="sk-button-m skeleton-anim" style="flex: 1"></div>
    </template>
    <template v-else>
      <button
        @click.stop="handleOpenExternal"
        class="btn-action"
        :class="{ compact: compact }"
        aria-label="View on RoyaleAPI"
      >
        <img
          src="https://cdn.royaleapi.com/static/img/branding/royaleapi-logo-128.png"
          :width="iconSize"
          :height="iconSize"
          alt="RoyaleAPI"
          class="royaleapi-logo"
        />
        <span>RoyaleAPI</span>
      </button>
      <button
        @click.stop="handleOpenInGame"
        class="btn-action primary"
        :class="{ compact: compact }"
        aria-label="Open in Game"
      >
        <Icon
          name="clash_royale"
          :size="iconSize"
          viewBox="0 0 1200 1200"
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
  transition: transform var(--sys-motion-duration-200) var(--sys-motion-spring);
}
</style>
