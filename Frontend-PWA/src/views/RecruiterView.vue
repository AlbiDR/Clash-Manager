<script setup lang="ts">
import { computed, watch, ref } from "vue";
import { useClashData } from "../composables/useClashData";
import { useHeadhunter } from "../composables/useHeadhunter";
import { useApiState } from "../composables/useApiState";
import { useToast } from "../composables/useToast";
import { useRecruitBlacklist } from "../composables/useRecruitBlacklist";
import { useConsoleController } from "../composables/useConsoleController";
import { useShowcaseMode } from "../composables/useShowcaseMode";
import { scanRecruitsDirect, isWorkerConfigured } from "../api/gasClient";
import type { Recruit } from "../types";

import RecruitCard from "../components/RecruitCard.vue";
import RecruitCardSkeleton from "../components/RecruitCardSkeleton.vue";
import Icon from "../components/Icon.vue";
import ConsoleLayout from "../components/ConsoleLayout.vue";

const { pingData } = useApiState();

const sheetUrl = computed(() => {
  if (!pingData.value?.spreadsheetUrl || !pingData.value?.sheets)
    return undefined;
  const gid =
    pingData.value.sheets["Headhunter"] ?? pingData.value.sheets["Recruiter"];
  return gid !== undefined
    ? `${pingData.value.spreadsheetUrl}#gid=${gid}`
    : pingData.value.spreadsheetUrl;
});

const { isShowcaseMode } = useShowcaseMode();
const {
  data,
  isHydrated,
  isRefreshing,
  syncError,
  lastSyncTime,
  refresh: refreshGas,
} = useClashData();
const { dismissRecruitsAction } = useHeadhunter();
const blacklist = useRecruitBlacklist();

// 🛡️ PRE-FILTER: Exclude Tombstones
const recruits = computed(() => {
  return (data.value?.hh || []).filter(
    (r) => !blacklist.tombstones.value.has(r.id),
  );
});

const getTs = (str?: string) => (str ? new Date(str).getTime() : 0);

const sortStrategies: Record<string, (a: Recruit, b: Recruit) => number> = {
  score: (a, b) => (b.potentialScore || 0) - (a.potentialScore || 0),
  trophies: (a, b) => (b.t || 0) - (a.t || 0),
  name: (a, b) => a.n.localeCompare(b.n),
  time_found: (a, b) => getTs(b.d.ago) - getTs(a.d.ago),
  donations: (a, b) => (b.d.don || 0) - (a.d.don || 0),
};

const {
  searchQuery,
  sortBy,
  visibleItems,
  expandedIds,
  selectedIds,
  selectedSet,
  fabState,
  isSelectionMode,
  status,
  statsBadge,
  showSkeletons,
  filteredItems,
  updateSort,
  toggleSelect,
  toggleExpand,
  clearSelection,
  handleAction,
  handleBlitz,
  handleSelectAll,
  handleSelectScore,
  processDeepLink,
} = useConsoleController({
  data: recruits,
  isHydrated,
  isRefreshing,
  syncError,
  lastSyncTime,
  filterFn: (r: Recruit) => [r.n, r.id],
  sortStrategies,
  defaultSort: "score",
  deepLinkPrefix: "recruit-",
  batchIdMapper: (r: Recruit) => r.id,
  statsLabel: "Pool",
});

const sortOptions = [
  {
    label: "Potential",
    value: "score",
    desc: `**Suppositional quality score** based on account progression and historical reliability.\n\n**Algorithm:**\nCompares the candidate's account stats against your current Clan baseline (Hybrid Benchmark).\n\n**Signal:**\n"Potential" indicates how well this recruit is expected to perform if they were to join the clan today. Values are strictly capped at 100%.`,
  },
  {
    label: "Trophies",
    value: "trophies",
    desc: `**Current ladder ranking** pull via Supercell API.\n\n**Insight:**\nReflects mechanical skill and King Tower progression.`,
  },
  {
    label: "Donations",
    value: "donations",
    desc: `**Lifetime card donations** from previous Clan history.\n\n**Logic:**\nMeasures long-term generosity.`,
  },
  {
    label: "Recency",
    value: "time_found",
    desc: `**Timestamp of discovery** during recent tournament scans.`,
  },
  {
    label: "Name",
    value: "name",
    desc: `**Alphabetical ordering** by display name.`,
  },
];

const listItems = computed(() => {
  if (isShowcaseMode.value) {
    return visibleItems.value.length > 0 ? visibleItems.value.slice(0, 1) : [];
  }
  return visibleItems.value;
});

// 🧹 CLEANUP: Extra Recruit Logic managed here
watch(
  () => data.value?.hh,
  (newRecruits) => {
    if (newRecruits && newRecruits.length > 0) {
      const currentIds = newRecruits.map((r) => r.id);
      blacklist.prune(currentIds);
    }
  },
  { deep: true, immediate: true },
);

const { undo, success, error, info } = useToast();

// ⚡ DIRECT SCAN: Turbo Mode
const isTurboScanning = ref(false);

async function handleRefresh() {
  if (isWorkerConfigured()) {
    isTurboScanning.value = true;
    info("Starting Turbo Scan via Worker...");

    // Direct Fetch (Bypassing GAS)
    const newCandidates = await scanRecruitsDirect();
    if (newCandidates && newCandidates.length > 0) {
      // Merge with existing data locally to update view instantly
      if (data.value) {
        // Simple merge: append new ones
        const existingIds = new Set(data.value.hh.map((r) => r.id));
        const merged = [...data.value.hh];
        let added = 0;
        newCandidates.forEach((c) => {
          if (!existingIds.has(c.id)) {
            merged.push(c);
            added++;
          }
        });
        // Mutate local state temporarily (will be overwritten by next full sync)
        data.value.hh = merged.sort(
          (a, b) => b.potentialScore - a.potentialScore,
        );
        success(`Turbo Scan: Found ${added} new recruits`);
      }
    } else {
      info("Turbo Scan complete. No new candidates.");
    }
    isTurboScanning.value = false;
  }

  // Always trigger full sync to ensure consistency
  refreshGas();
}

function dismissBulk() {
  if (selectedIds.value.length === 0) return;
  const ids = [...selectedIds.value];
  clearSelection();
  executeDismiss(ids);
}

function executeDismiss(ids: string[]) {
  blacklist.hide(ids);

  const timerId = setTimeout(() => {
    dismissRecruitsAction(ids).catch(() => {
      error("Failed to sync changes");
      blacklist.restore(ids);
    });
  }, 4500);

  undo(`Dismissed ${ids.length} recruits`, () => {
    clearTimeout(timerId);
    blacklist.restore(ids);
    success("Dismissal cancelled");
  });
}

// Specific Helper for Score Selection
function onSelectScore(threshold: number, mode: "ge" | "le") {
  handleSelectScore(threshold, mode, (r) => r.potentialScore || 0);
}

function handleSearchUpdate(val: string) {
  searchQuery.value = val;
}
</script>

<template>
  <ConsoleLayout
    title="Headhunter"
    :status="status"
    :show-search="true"
    :sheet-url="sheetUrl"
    :stats="statsBadge"
    :sort-options="sortOptions"
    :current-sort="sortBy"
    :loading="isRefreshing && !isHydrated"
    :skeleton-component="RecruitCardSkeleton"
    :is-selection-mode="isSelectionMode"
    :selected-count="selectedIds.length"
    :is-refreshing="isRefreshing || isTurboScanning"
    :sync-error="syncError"
    :is-empty="!showSkeletons && filteredItems.length === 0"
    :fab-state="fabState"
    @refresh="handleRefresh"
    @update:search="handleSearchUpdate"
    @update:sort="updateSort"
    @select-all="handleSelectAll"
    @clear-selection="clearSelection"
    @select-score="onSelectScore"
    @fab-action="handleAction"
    @fab-blitz="handleBlitz"
    @fab-dismiss="dismissBulk"
  >
    <!-- Custom Empty Action for Recruit View -->
    <template #empty-action>
      <button class="btn-primary" @click="handleRefresh">
        <Icon name="refresh" size="18" />
        <span>Scan Again</span>
      </button>
    </template>
    <!-- Default Slot: The List -->
    <!-- Exhibition Row (Only 1 card + skeletons if specialized) -->
    <template v-if="isShowcaseMode">
      <RecruitCard
        v-if="visibleItems.length > 0"
        :recruit="visibleItems[0]"
        :expanded="expandedIds.has(visibleItems[0].id)"
        :selected="selectedSet.has(visibleItems[0].id)"
        :selection-mode="isSelectionMode"
        @toggle-expand="toggleExpand(visibleItems[0].id)"
        @toggle-select="toggleSelect(visibleItems[0].id)"
      />
      <SkeletonCard v-for="i in 7" :key="'ex-' + i" />
    </template>
    <template v-else>
      <RecruitCard
        v-for="(recruit, index) in visibleItems"
        :key="recruit.id"
        v-memo="[
          recruit.potentialScore,
          recruit.t,
          expandedIds.has(recruit.id),
          selectedSet.has(recruit.id),
          isSelectionMode,
          expandedIds.has(recruit.id) && isRefreshing,
        ]"
        :id="`recruit-${recruit.id}`"
        :recruit="recruit"
        :expanded="expandedIds.has(recruit.id)"
        :selected="selectedSet.has(recruit.id)"
        :selection-mode="isSelectionMode"
        :style="{ '--i': index }"
        :app-is-refreshing="isRefreshing"
        @toggle-expand="toggleExpand(recruit.id)"
        @toggle-select="toggleSelect(recruit.id)"
      />
    </template>
  </ConsoleLayout>
</template>

<style scoped>
.btn-primary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: var(--sys-color-primary);
  color: var(--sys-color-on-primary);
  border: none;
  border-radius: 99px;
  font-weight: 700;
  cursor: pointer;
  margin-top: 16px;
  transition: transform 0.2s;
}
.btn-primary:active {
  transform: scale(0.95);
}
</style>
