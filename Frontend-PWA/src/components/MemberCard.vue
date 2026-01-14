<script setup lang="ts">
import { computed, defineAsyncComponent } from "vue";
import type { LeaderboardMember } from "../types";
import Icon from "./Icon.vue";
import BaseCard from "./BaseCard.vue";
import { useBenchmarking } from "../composables/useBenchmarking";
import { useModules } from "../composables/useModules";
import { getScoreTone, formatRole } from "../utils/formatters";
import { useExternalLink } from "../composables/useExternalLink";

const WarHistoryChart = defineAsyncComponent(
  () => import("./WarHistoryChart.vue"),
);

const {
  id,
  member,
  expanded,
  selected,
  selectionMode,
  appIsRefreshing = false,
} = defineProps<{
  id: string;
  member: LeaderboardMember;
  expanded: boolean;
  selected: boolean;
  selectionMode: boolean;
  appIsRefreshing?: boolean;
}>();

const emit = defineEmits<{
  toggle: [];
  "toggle-select": [];
}>();

const { getBenchmark } = useBenchmarking();
const { modules } = useModules();
const { openExternal, openInGame } = useExternalLink();

// Formatters
const roleInfo = (role: string) => formatRole(role);
const scoreTone = (score: number) => getScoreTone(score);

const trendInfo = computed(() => {
  const dt = Number(member.dt) || 0;
  const currentRaw = Number(member.r) || 0;
  if (dt === 0 || currentRaw === 0) return null;
  const previousRaw = currentRaw - dt;
  if (previousRaw < 50) return null;
  if (previousRaw > 0 && dt / previousRaw > 10) return null;
  const percentChange = (dt / previousRaw) * 100;
  const absPercent = Math.abs(percentChange);
  let valStr = "";
  if (absPercent < 0.1 && absPercent > 0) valStr = "<0.1%";
  else if (absPercent < 10) valStr = absPercent.toFixed(1) + "%";
  else valStr = Math.round(absPercent) + "%";
  return {
    val: valStr,
    dir: dt > 0 ? "up" : "down",
    raw: dt,
  };
});
</script>

<template>
  <BaseCard
    :id="id"
    :expanded="expanded"
    :selected="selected"
    :selection-mode="selectionMode"
    :tone-class="scoreTone(member.s)"
    :aria-label="`${member.n}, score ${Math.round(member.s)}, ${roleInfo(member.d.role).label}`"
    @toggle="emit('toggle')"
    @toggle-select="emit('toggle-select')"
  >
    <!-- SLOT: Meta Stack -->
    <template #identity-meta>
      <div
        class="badge tenure hit-target"
        v-tooltip="
          modules.ghostBenchmarking
            ? getBenchmark('lb', 'tenure', member.d.days)
            : null
        "
      >
        {{ member.d.days }}d
      </div>
      <div class="badge role" :class="roleInfo(member.d.role).class">
        {{ roleInfo(member.d.role).label }}
      </div>
    </template>

    <!-- SLOT: Name Block -->
    <template #identity-name>
      <span class="player-name">{{ member.n }}</span>
      <div
        class="trophy-meta hit-target"
        v-tooltip="
          modules.ghostBenchmarking
            ? getBenchmark('lb', 'trophies', member.t)
            : null
        "
      >
        <Icon name="trophy" size="12" />
        <span class="trophy-val">{{ (member.t || 0).toLocaleString() }}</span>
      </div>
    </template>

    <!-- SLOT: Score Section -->
    <template #score-section>
      <span
        class="stat-score"
        v-tooltip="
          modules.ghostBenchmarking
            ? getBenchmark('lb', 'score', member.s)
            : null
        "
        >{{ Math.round(member.s || 0) }}</span
      >
      <div
        v-if="trendInfo"
        class="momentum-pill hit-target"
        :class="trendInfo.dir"
        v-tooltip="
          modules.ghostBenchmarking
            ? getBenchmark('lb', 'momentum', trendInfo.raw)
            : null
        "
      >
        <Icon
          :name="trendInfo.dir === 'up' ? 'trend_up' : 'trend_down'"
          size="10"
        />
        <span class="trend-val">{{ trendInfo.val }}</span>
      </div>
    </template>

    <!-- SLOT: Expanded Content -->
    <template #expanded-content>
      <div class="stats-grid" :aria-busy="appIsRefreshing">
        <template v-if="appIsRefreshing">
          <div v-for="i in 4" :key="i" class="stat-item skeleton-anim">
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
            v-tooltip="
              modules.ghostBenchmarking
                ? getBenchmark(
                    'lb',
                    'warRate',
                    parseFloat(member.d.rate || '0'),
                  )
                : null
            "
          >
            <span class="label">War Rate</span>
            <span class="value">{{ member.d.rate }}</span>
          </div>
          <div class="stat-item">
            <span class="label">Average Fame</span>
            <span class="value">{{
              (member.d.wfame || 0).toLocaleString()
            }}</span>
          </div>
          <div
            class="stat-item hit-target"
            v-tooltip="
              modules.ghostBenchmarking
                ? getBenchmark('lb', 'donations', member.d.avg)
                : null
            "
          >
            <span class="label">Daily Donations</span>
            <span class="value">{{ member.d.avg }}</span>
          </div>
          <div class="stat-item">
            <span class="label">Last Seen</span>
            <span class="value">{{ member.d.seen }}</span>
          </div>
        </template>
      </div>

      <WarHistoryChart :history="member.d.hist" :loading="appIsRefreshing" />

      <div class="actions">
        <template v-if="appIsRefreshing">
          <div class="sk-button-m skeleton-anim" style="flex: 1"></div>
          <div class="sk-button-m skeleton-anim" style="flex: 1"></div>
        </template>
        <template v-else>
          <button
            @click="openExternal(`https://royaleapi.com/player/${member.id}`)"
            class="btn-action"
          >
            <Icon name="analytics" size="16" />
            <span>RoyaleAPI</span>
          </button>
          <button @click="openInGame(member.id)" class="btn-action primary">
            <Icon name="crown" size="16" />
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
.badge.role {
  font-family: var(--sys-font-family-body);
  font-weight: 900;
  font-size: 9px;
}

/* Role Colors */
.role-leader {
  background: var(--sys-color-primary);
  color: var(--sys-color-on-primary);
}
.role-coleader {
  background: var(--sys-color-primary-container);
  color: var(--sys-color-on-primary-container);
  border: 1px solid rgba(var(--sys-color-primary-rgb), 0.2);
}
.role-elder {
  background: var(--sys-color-secondary-container);
  color: var(--sys-color-on-secondary-container);
}
.role-member {
  background: var(--sys-color-surface-container-highest);
  color: var(--sys-color-on-surface);
  border: 1px solid var(--sys-color-outline-variant);
}

.stat-score {
  font-size: 18px;
  font-weight: 900;
  font-family: var(--sys-font-family-mono);
}

.momentum-pill {
  position: absolute;
  bottom: -8px;
  left: 50%;
  transform: translateX(-50%);
  height: 18px;
  padding: 0 6px;
  background: var(--sys-color-surface-container-highest);
  border-radius: 10px;
  display: flex;
  align-items: center;
  gap: 2px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
  z-index: 10;
  border: 1px solid var(--sys-surface-glass-border);
}
.momentum-pill.up {
  color: #166534;
}
:root.dark .momentum-pill.up {
  color: #22c55e;
}
.momentum-pill.down {
  color: #991b1b;
}
:root.dark .momentum-pill.down {
  color: #ef4444;
}
.trend-val {
  font-size: 9px;
  font-weight: 900;
  font-family: var(--sys-font-family-mono);
}

/* Expanded Content Stats */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
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
.stat-item .label {
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
.stat-item .value {
  font-size: 14px;
  font-weight: 900;
  color: var(--sys-color-on-surface);
  font-family: var(--sys-font-family-mono);
  line-height: 1;
}

@media (max-width: 360px) {
  .stats-grid {
    gap: 6px;
  }
  .stat-item {
    padding: 4px 2px;
  }
  .stat-item .value {
    font-size: 13px;
  }
}

.actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}
.btn-action {
  flex: 1;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: var(--sys-color-surface-container-highest);
  color: var(--sys-color-on-surface);
  font-weight: 700;
  text-decoration: none;
  border: none;
  cursor: pointer;
}
.btn-action.primary {
  background: var(--sys-color-primary);
  color: var(--sys-color-on-primary);
}
</style>
