<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import { computed, unref } from "vue";
import { useHaptics } from "@core";
import { useHeaderScroll } from "../composables/useHeaderScroll";
import StatusPill from "./StatusPill.vue";
import Icon from "./Icon.vue";
import BaseSelect from "./BaseSelect.vue";

const props = defineProps<{
  title: string;
  status?: {
    type: "success" | "warning" | "error" | "loading";
    text: string;
    nominal?: boolean;
  };
  showSearch?: boolean;
  dashboardUrl?: string;
  stats?: { label: string; value: string };
  sortOptions?: { label: string; value: string; desc?: string; fullDesc?: string }[];
  currentSort?: string;
  loading?: boolean;
  remoteInfo?: {
    source: "SUPABASE";
    dataAge: string | null;
    diagnosis?: "TIMEOUT" | "AUTH" | "VALIDATION" | "OFFLINE" | "SUCCESS" | null;
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
  const searchQuery = (e.target as HTMLInputElement).value;
  if (debounceTimer) window.clearTimeout(debounceTimer);

  debounceTimer = window.setTimeout(() => {
    emit("update:search", searchQuery);
  }, 300);
};

const activeSortDescription = computed(() => {
  if (!props.sortOptions || !props.currentSort) return "";
  const opt = props.sortOptions.find((o) => o.value === props.currentSort);
  return opt?.desc || "";
});

const handleOpenDashboard = () => {
  if (props.dashboardUrl) {
    haptics.tap();
    window.open(props.dashboardUrl, "_blank");
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
            <h1
              class="view-title"
              :class="{ 'is-link': props.dashboardUrl }"
              :title="props.dashboardUrl ? 'Open Supabase Dashboard' : undefined"
              @click="handleOpenDashboard"
            >
              {{ props.title }}
            </h1>
            <div v-if="props.stats" class="title-label">
              <span class="count-value">{{ props.stats.value }}</span>
              <span class="count-label">{{ props.stats.label }}</span>
            </div>
          </div>
        </div>

        <div class="action-group">
          <StatusPill
            v-if="props.status && !props.loading"
            :type="props.status.type"
            :text="props.status.text"
            :nominal="props.status.nominal"
            :remote-info="props.remoteInfo"
            direction="left"
            @refresh="emit('refresh')"
          />
        </div>
      </div>

      <div v-if="props.showSearch || !!$slots.filters" class="search-sort-row">
        <div v-if="props.showSearch" class="search-bar">
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

        <!-- Custom Filters / Controls Slot -->
        <slot name="filters"></slot>

        <div v-if="props.sortOptions" class="sort-box">
          <BaseSelect
            :model-value="props.currentSort"
            :options="props.sortOptions"
            aria-label="Sort by"
            @update:model-value="(val) => emit('update:sort', val)"
          />
          <span v-if="activeSortDescription" class="sort-desc">
            {{ activeSortDescription }}
          </span>
        </div>
      </div>
    </div>

    <div class="header-extra" v-if="!!$slots.extra">
      <slot name="extra"></slot>
    </div>
  </header>
</template>

<style scoped>
.console-header {
  position: sticky;
  top: 0;
  z-index: var(--sys-z-header);
  background: var(--sys-surface-glass);
  backdrop-filter: var(--sys-surface-glass-blur);
  -webkit-backdrop-filter: var(--sys-surface-glass-blur);
  border: 1px solid var(--sys-surface-glass-border);
  border-radius: var(--sys-shape-corner-extra-large);
  padding: var(--sys-space-18) var(--sys-space-18) var(--sys-space-24) var(--sys-space-18);
  margin-bottom: var(--sys-space-24);
  transition: all var(--sys-motion-duration-400) var(--sys-motion-spring);
  box-shadow: var(--sys-elevation-2);
}

.console-header.is-scrolled {
  margin-top: var(--sys-space-8);
  padding: var(--sys-space-12) var(--sys-space-18) var(--sys-space-18) var(--sys-space-18);
  border-radius: var(--sys-shape-corner-m);
}

.header-main {
  display: flex;
  flex-direction: column;
  gap: var(--sys-space-12);
}

.header-extra {
  margin-top: var(--sys-space-12);
}

.title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--sys-space-12);
}

.title-group {
  display: flex;
  align-items: center;
  gap: var(--sys-space-12);
  flex: 1;
  min-width: 0;
}

.title-main {
  display: flex;
  align-items: baseline;
  gap: var(--sys-space-8);
  flex-wrap: nowrap;
  min-width: 0;
  flex: 1;
}

.view-title {
  margin: 0;
  font-size: var(--sys-typescale-title-lg);
  line-height: var(--sys-leading-none);
  font-weight: 900;
  color: var(--sys-color-on-surface);
  letter-spacing: var(--sys-tracking-tight);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: all var(--sys-motion-duration-200) var(--sys-motion-spring);
  min-width: 0;
  flex-shrink: 1;
}

.view-title.is-link {
  cursor: pointer;
}

.view-title.is-link:hover {
  color: var(--sys-primary);
}

.view-title.is-link:active {
  transform: scale(0.96);
  opacity: 0.8;
}

.title-label {
  display: flex;
  align-items: baseline;
  gap: var(--sys-space-4);
  padding: var(--sys-space-2) var(--sys-space-8);
  background: var(--sys-color-surface-container);
  border-radius: var(--sys-shape-corner-small);
  font-family: var(--sys-font-family-mono);
  flex-shrink: 0;
}

.count-value {
  font-size: var(--sys-typescale-body-md);
  font-weight: 800;
  color: var(--sys-color-primary);
}

.count-label {
  font-size: var(--sys-typescale-label-md);
  text-transform: uppercase;
  color: var(--sys-color-on-surface-variant);
  font-weight: 600;
}

.action-group {
  display: flex;
  align-items: center;
  gap: var(--sys-space-8);
  flex-shrink: 0;
}

.search-sort-row {
  display: flex;
  align-items: center;
  gap: var(--sys-space-12);
}

.search-bar {
  flex: 1;
  min-width: 0;
}

.search-box {
  position: relative;
  height: 40px;
  background: var(--sys-color-surface-container-high);
  border-radius: var(--sys-shape-corner-input);
  display: flex;
  align-items: center;
  padding: 0 var(--sys-space-14);
  gap: var(--sys-space-12);
  border: 1px solid rgba(128, 128, 128, 0.15);
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.02);
  transition: all var(--sys-motion-duration-200) ease;
}

.search-box:focus-within {
  border-color: rgba(var(--sys-color-primary-rgb), 0.3);
}

.search-icon {
  color: var(--sys-color-on-surface-variant);
}

.search-input {
  flex: 1;
  background: none;
  border: none;
  color: var(--sys-color-on-surface);
  font-size: var(--sys-typescale-body-rg);
  outline: none;
}

.sort-box {
  flex-shrink: 0;
  width: auto;
  min-width: 110px;
}

.sort-desc {
  display: none;
}
</style>
