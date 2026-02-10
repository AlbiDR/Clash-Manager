import { Icon } from "@shared";
import { useExternalLink } from "@core";
<script setup lang="ts">
/**
 * 🛠️ CARD ACTIONS
 * Atomic component for player-specific action buttons (RoyaleAPI, Open Game).
 * Deduplicated from MemberCard and RecruitCard.
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

const iconSize = props.compact ? 14 : 16;
</script>

<template>
  <div class="card-actions-wrapper">
    <template v-if="loading">
      <div class="sk-button-m skeleton-anim" style="flex: 1"></div>
      <div class="sk-button-m skeleton-anim" style="flex: 1"></div>
    </template>
    <template v-else>
      <button
        @click.stop="openExternal(`https://royaleapi.com/player/${id}`)"
        class="btn-action"
        :class="{ compact: compact }"
        aria-label="View on RoyaleAPI"
      >
        <Icon name="analytics" :size="iconSize" />
        <span>RoyaleAPI</span>
      </button>
      <button
        @click.stop="openInGame(id)"
        class="btn-action primary"
        :class="{ compact: compact }"
        aria-label="Open in Game"
      >
        <Icon name="crown" :size="iconSize" />
        <span>Open Game</span>
      </button>
    </template>
  </div>
</template>

<style scoped>
.card-actions-wrapper {
  display: flex;
  gap: 8px;
  width: 100%;
}
</style>
