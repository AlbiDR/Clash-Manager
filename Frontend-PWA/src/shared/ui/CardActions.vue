<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import Icon from "./Icon.vue";
import { useExternalLink } from "@core/services/useExternalLink";
import { useHaptics } from "@shared/composables/useHaptics";

/**
 * [UTIL] CARD ACTIONS
 * Atomic component for the deliberate next steps after evaluating a player.
 * Deduplicated from MemberCard and RecruitCard.
 *
 * @remarks
 * [DECISION LOG] The game hand-off is primary because it advances the player
 * evaluation. RoyaleAPI remains available as the quieter supporting reference.
 * The cluster has a bounded width so wide cards do not turn two actions into
 * anonymous full-width slabs.
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
      />
      <div
        class="sk-button-m skeleton-anim"
      />
    </template>
    <template v-else>
      <button
        type="button"
        class="btn-action card-action card-action--reference"
        :class="{ compact: compact }"
        :aria-label="`View ${props.id} on RoyaleAPI`"
        @click.stop="handleOpenExternal"
      >
        <Icon
          name="globe"
          :size="iconSize"
          aria-hidden="true"
        />
        <span>RoyaleAPI</span>
      </button>
      <button
        type="button"
        class="btn-action primary card-action card-action--game"
        :class="{ compact: compact }"
        :aria-label="`Open ${props.id} in Clash Royale`"
        @click.stop="handleOpenInGame"
      >
        <Icon
          name="external-link"
          :size="iconSize"
          aria-hidden="true"
        />
        <span>Open Game</span>
      </button>
    </template>
  </div>
</template>

<style scoped>
.card-actions-wrapper {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
  gap: var(--sys-space-8);
  width: min(100%, var(--sys-layout-action-cluster-max));
}

.card-action {
  min-width: 0;
  border: 1px solid transparent;
}

.card-action--reference {
  border-color: var(--sys-color-outline-variant);
  background: var(--sys-color-surface-container-high);
  color: var(--sys-color-on-surface-variant);
}

.card-action--game {
  box-shadow: var(--sys-elevation-2);
}

.card-action:hover {
  transform: translateY(calc(-1 * var(--sys-space-2)));
}

.card-action:focus-visible {
  outline: 2px solid var(--sys-color-primary);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .card-action:hover { transform: none; }
}
</style>
