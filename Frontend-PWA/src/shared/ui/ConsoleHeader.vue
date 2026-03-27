<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import { computed, ref, unref } from "vue";
import { useHaptics } from "@core";
import { useHeaderScroll } from "../composables/useHeaderScroll";
import StatusPill from "./StatusPill.vue";
import Icon from "./Icon.vue";

const props = defineProps<{
  title: string;
  status?: {
    type: "success" | "warning" | "error" | "loading";
    text: string;
    nominal?: boolean;
  };
  showSearch?: boolean;
  sheetUrl?: string;
  stats?: { label: string; value: string };
  sortOptions?: { label: string; value: string; desc?: string; fullDesc?: string }[];
  currentSort?: string;
  loading?: boolean;
  hubInfo?: {
    source: "WORKER" | "GAS";
    hubAge: string | null;
  };
  reserveExtraSpace?: boolean;
}>();

const emit = defineEmits<{
  "update:search": [string];
  "update:sort": [string];
  refresh: [];
}>();

const haptics = useHaptics();
const { isScrolled } = useHeaderScroll(10);

let debounceTimer: number | null = null;

const handleInput = (e: Event) => {
  const val = (e.target as HTMLInputElement).value;
  if (debounceTimer) window.clearTimeout(debounceTimer);

  debounceTimer = window.setTimeout(() => {
    emit("update:search", val);
  }, 300);
};

const activeSortDescription = computed(() => {
  if (!props.sortOptions || !props.currentSort) return "";
  const opt = props.sortOptions.find((o) => o.value === props.currentSort);
  return opt?.desc || "";
});

const activeSortFullDescription = computed(() => {
  if (!props.sortOptions || !props.currentSort) return "";
  const opt = props.sortOptions.find((o) => o.value === props.currentSort);
  return opt?.fullDesc || "";
});

const handleOpenSheet = () => {
  if (props.sheetUrl) {
    haptics.tap();
    window.open(props.sheetUrl, "_blank");
  }
};
</script>

<template>
  <header
    class="console-header"
    :class="{ 'is-scrolled': unref(isScrolled), 'has-extra': props.reserveExtraSpace }"
  >
    <div class="header-main">
      <div class="title-row">
        <div class="title-group">
          <div class="title-main">
            <h1 class="view-title">{{ props.title }}</h1>
            <div v-if="props.stats" class="title-label">
              <span class="count-value">{{ props.stats.value }}</span>
              <span class="count-label">{{ props.stats.label }}</span>
            </div>
          </div>
          
          <button
            v-if="props.sheetUrl || (props.title === 'Roster')"
            class="icon-btn spreadsheet-btn"
            title="Open Source Sheet"
            aria-label="Open Source Sheet"
            @click="handleOpenSheet"
          >
            <Icon name="external-link" size="20" />
          </button>
        </div>

        <div class="action-group">
          <StatusPill
            v-if="props.status && !props.loading"
            :type="props.status.type"
            :text="props.status.text"
            :nominal="props.status.nominal"
            :hub-info="props.hubInfo"
            direction="left"
          />
        </div>
      </div>


      <div v-if="props.showSearch" class="search-sort-row">
        <div class="search-bar">
          <div class="search-box">
            <Icon name="search" size="18" class="search-icon" />
            <input
              type="text"
              class="search-input"
              placeholder="Search..."
              autocomplete="off"
              aria-label="Search"
              @input="handleInput"
            />
          </div>
        </div>

        <div v-if="props.sortOptions" class="sort-box">
          <div class="sort-select-wrapper">
            <select
              :value="props.currentSort"
              class="sort-select"
              aria-label="Sort by"
              @change="(e) => emit('update:sort', (e.target as HTMLSelectElement).value)"
            >
              <option
                v-for="opt in props.sortOptions"
                :key="opt.value"
                :value="opt.value"
              >
                {{ opt.label }}
              </option>
            </select>
            <Icon name="chevron-down" size="14" class="sort-chevron" />
          </div>
          <span v-if="activeSortDescription" class="sort-desc">
            {{ activeSortDescription }}
          </span>
        </div>
      </div>
    </div>

    <div class="header-extra">
      <slot name="extra"></slot>
    </div>
  </header>
</template>

<style scoped>
.console-header {
  position: sticky;
  top: 0;
  z-index: 100;
  background: var(--sys-surface-glass);
  backdrop-filter: var(--sys-surface-glass-blur);
  -webkit-backdrop-filter: var(--sys-surface-glass-blur);
  border: 1px solid var(--sys-surface-glass-border);
  border-radius: 28px;
  padding: 18px;
  margin-bottom: 24px;
  transition: all 0.4s var(--sys-motion-standard);
  box-shadow: var(--sys-elevation-2);
}

.console-header.is-scrolled {
  margin-top: 8px;
  padding: 12px 18px;
  border-radius: 20px;
}

.header-main {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.title-group {
  display: flex;
  align-items: baseline;
  gap: 12px;
  flex: 1;
  min-width: 0; /* Prevents overflow pushing elements off-screen */
}

.title-main {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}

.view-title {
  margin: 0;
  font-size: 24px;
  font-weight: 900;
  color: var(--sys-text-primary);
  letter-spacing: -0.03em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.title-label {
  display: flex;
  align-items: baseline;
  gap: 4px;
  padding: 2px 8px;
  background: var(--sys-surf-c);
  border-radius: 8px;
  font-family: var(--sys-font-mono);
}

.count-value {
  font-size: 14px;
  font-weight: 800;
  color: var(--sys-primary);
}

.count-label {
  font-size: 10px;
  text-transform: uppercase;
  color: var(--sys-text-tertiary);
  font-weight: 600;
}

.icon-btn {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  border: 1px solid var(--sys-color-outline-variant);
  background: var(--sys-surf-c);
  color: var(--sys-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  padding: 0;
  cursor: pointer;
}

.icon-btn:active {
  transform: scale(0.92);
  background: var(--sys-surf-h);
}

.spreadsheet-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: none;
  border: none;
  color: var(--sys-text-tertiary);
}

.spreadsheet-btn:hover {
  color: var(--sys-primary);
}

.action-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.search-sort-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.search-bar {
  flex: 1;
  min-width: 0; /* Allows input side to shrink on small screens */
}

.search-box {
  position: relative;
  height: 40px;
  background: var(--sys-surf-h);
  border-radius: 14px;
  display: flex;
  align-items: center;
  padding: 0 14px;
  gap: 12px;
  border: 1px solid rgba(128, 128, 128, 0.15); /* Soft, extremely pleasant visual boundary */
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.02); /* Slight depth */
  transition: all 0.2s ease;
}

.search-box:focus-within {
  border-color: var(--sys-primary-muted);
}

.search-icon {
  color: var(--sys-text-tertiary);
}

.search-input {
  flex: 1;
  background: none;
  border: none;
  color: var(--sys-text-primary);
  font-size: 15px;
  outline: none;
}

.sort-box {
  flex-shrink: 0;
  width: auto;
  min-width: 110px; /* Reduced to provide more room on mobile */
}

.sort-select-wrapper {
  position: relative;
  width: 100%;
}

.sort-select {
  width: 100%;
  height: 40px;
  padding: 0 12px;
  padding-right: 32px;
  background: var(--sys-surf-c);
  border: 1px solid rgba(128, 128, 128, 0.15);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02);
  border-radius: 10px;
  appearance: none;
  color: var(--sys-text-secondary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.sort-chevron {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--sys-text-tertiary);
  pointer-events: none;
}

.sort-desc {
  display: none;
}
</style>
