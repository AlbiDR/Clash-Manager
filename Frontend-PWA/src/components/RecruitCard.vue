<script setup lang="ts">
import { computed } from "vue";
import type { Recruit } from "../types";
import Icon from "./Icon.vue";
import BaseCard from "./BaseCard.vue";
import { useBenchmarking } from "../composables/useBenchmarking";
import { useModules } from "../composables/useModules";
import { getScoreTone, formatTimeAgoShort } from "../utils/formatters";

import { useExternalLink } from "../composables/useExternalLink";

const {
  id,
  recruit,
  expanded,
  selected,
  selectionMode,
  appIsRefreshing = false,
} = defineProps<{
  id: string;
  recruit: Recruit;
  expanded: boolean;
  selected: boolean;
  selectionMode: boolean;
  appIsRefreshing?: boolean;
}>();

const emit = defineEmits<{
  "toggle-expand": [];
  "toggle-select": [];
}>();

const { getBenchmark } = useBenchmarking();
const { modules } = useModules();
const { openExternal, openInGame } = useExternalLink();

function getTooltip(metric: string, value: number | undefined) {
  if (!modules.ghostBenchmarking || value === undefined) return null;
  return getBenchmark("hh", metric, value);
}

const toneClass = computed(() => getScoreTone(recruit.s));
const timeAgo = computed(() => formatTimeAgoShort(recruit.d.ago));
</script>

<template>
  <BaseCard
    :id="id"
    :expanded="expanded"
    :selected="selected"
    :selection-mode="selectionMode"
    :tone-class="toneClass"
    @toggle="emit('toggle-expand')"
    @toggle-select="emit('toggle-select')"
  >
    <!-- SLOT: Meta Stack -->
    <template #identity-meta>
      <div class="badge time">{{ timeAgo }}</div>
      <div class="badge tag">#{{ recruit.id.substring(0, 5) }}</div>
    </template>

    <!-- SLOT: Name Block -->
    <template #identity-name>
      <span class="player-name">{{ recruit.n }}</span>
      <div
        class="trophy-meta hit-target"
        v-tooltip="getTooltip('trophies', recruit.t)"
      >
        <Icon name="trophy" size="12" />
        <span class="trophy-val">{{ (recruit.t || 0).toLocaleString() }}</span>
      </div>
    </template>

    <!-- SLOT: Score Section -->
    <template #score-section>
      <span class="stat-score" v-tooltip="getTooltip('score', recruit.s)">{{
        Math.round(recruit.s || 0)
      }}</span>
    </template>

    <!-- SLOT: Expanded Content -->
    <template #expanded-content>
      <div class="stats-grid" :aria-busy="appIsRefreshing">
        <template v-if="appIsRefreshing">
          <div v-for="i in 3" :key="i" class="stat-item skeleton-anim">
            <div
              class="sk-text-line-s"
              :style="{ width: `${50 + i * 5}px` }"
            ></div>
            <div
              class="sk-stat-value"
              :style="{ width: `${40 + i * 5}px` }"
            ></div>
          </div>
        </template>
        <template v-else>
          <div
            class="stat-item hit-target"
            v-tooltip="getTooltip('donations', recruit.d.don)"
          >
            <span class="label">Donations</span>
            <span class="value">{{ recruit.d.don }}</span>
          </div>
          <div
            class="stat-item hit-target"
            v-tooltip="getTooltip('warWins', recruit.d.war)"
          >
            <span class="label">War Wins</span>
            <span class="value">{{ recruit.d.war }}</span>
          </div>
          <div
            class="stat-item hit-target"
            v-tooltip="getTooltip('cardsWon', recruit.d.cards)"
          >
            <span class="label">Cards Won</span>
            <span class="value">{{ recruit.d.cards || "-" }}</span>
          </div>
        </template>
      </div>

      <div class="actions-toolbar">
        <template v-if="appIsRefreshing">
          <div class="sk-button-m skeleton-anim" style="flex: 1"></div>
          <div class="sk-button-m skeleton-anim" style="flex: 1"></div>
        </template>
        <template v-else>
          <button
            @click="openExternal(`https://royaleapi.com/player/${recruit.id}`)"
            class="btn-action compact"
          >
            <Icon name="analytics" size="14" />
            <span>RoyaleAPI</span>
          </button>
          <button
            @click="openInGame(recruit.id)"
            class="btn-action primary compact"
          >
            <Icon name="crown" size="14" />
            <span>Open Game</span>
          </button>
        </template>
      </div>
    </template>
  </BaseCard>
</template>

<style scoped>
/* Content specific styles only */
.player-name {
  font-size: 16px;
  font-weight: 850;
  color: var(--sys-color-on-surface);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: -0.02em;
  line-height: 1.1;
}
.trophy-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #854d0e;
  margin-top: 2px;
  width: fit-content;
}
:root.dark .trophy-meta {
  color: #fbbf24;
}
.trophy-val {
  font-size: 13px;
  font-weight: 700;
  font-family: var(--sys-font-family-mono);
}

.badge {
  height: 18px;
  width: 100%;
  background: var(--sys-color-surface-container-highest);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 800;
  color: var(--sys-color-on-surface);
  font-family: var(--sys-font-family-mono);
  text-transform: uppercase;
}

.stat-score {
  font-size: 18px;
  font-weight: 900;
  font-family: var(--sys-font-family-mono);
}

/* Recruit Specific Stats Layout */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 12px;
}
.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px 4px;
  border-radius: 10px;
  background: var(--sys-color-surface-container-highest);
  border: 1px solid var(--sys-surface-glass-border);
  transition:
    transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1),
    background-color 0.2s ease,
    box-shadow 0.2s ease;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}
.stat-item:hover {
  transform: translateY(-2px) scale(1.02);
  background: var(--sys-color-surface-container-high);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  z-index: 2;
}

.label {
  font-size: 9px;
  text-transform: uppercase;
  font-weight: 850;
  color: var(--sys-color-secondary);
  letter-spacing: 0.06em;
  opacity: 0.7;
  text-align: center;
  line-height: 1.1;
  min-height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  word-break: break-word;
}
.value {
  font-size: 14px;
  font-weight: 900;
  color: var(--sys-color-on-surface);
  font-family: var(--sys-font-family-mono);
  line-height: 1;
}

@media (max-width: 380px) {
  .stats-grid {
    gap: 4px;
  }
  .stat-item {
    padding: 4px 2px;
  }
  .value {
    font-size: 12px;
  }
  .label {
    font-size: 8px;
  }
}

.actions-toolbar {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.btn-action {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 44px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 700;
  text-decoration: none;
  border: none;
  cursor: pointer;
  background: var(--sys-color-surface-container-highest);
  color: var(--sys-color-on-surface);
}
.btn-action.primary {
  background: var(--sys-color-primary);
  color: var(--sys-color-on-primary);
}
</style>
