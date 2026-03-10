<script setup lang="ts">
import Icon from "./Icon.vue";
import StatusPill from "./StatusPill.vue";
import { useHaptics } from "@core/services/useHaptics";
import { useHeaderScroll } from "../composables/useHeaderScroll";
import { useAppSettings } from "@core/services/useAppSettings";
import { ref, computed } from "vue";
import HeaderInfoOverlay from "./HeaderInfoOverlay.vue";
const props = defineProps<{
  title: string;
  status?: { type: "updated" | "error" | "loading" | "ready"; text: string };
  showSearch?: boolean;
  sheetUrl?: string;
  stats?: { label: string; value: string };
  sortOptions?: { label: string; value: string; desc?: string }[];
  currentSort?: string;
  loading?: boolean;
  reserveExtraSpace?: boolean;
}>();

const emit = defineEmits<{
  "update:search": [value: string];
  "update:sort": [value: string];
  refresh: [];
}>();

const { modules } = useAppSettings();
const { isScrolled } = useHeaderScroll();
const haptics = useHaptics();

const showInfoOverlay = ref(false);
let debounceTimer: number | null = null;

const handleInput = (e: Event) => {
  const val = (e.target as HTMLInputElement).value;
  if (debounceTimer) clearTimeout(debounceTimer);

  // Debounce search by 300ms to improve rendering performance on large lists
  debounceTimer = window.setTimeout(() => {
    emit("update:search", val);
  }, 300);
};

const activeSortDescription = computed(() => {
  if (!modules.sortExplanation) return null;
  const selected = props.sortOptions?.find(
    (opt) => opt.value === props.currentSort,
  );
  return selected?.desc || null;
});

function openOverlay() {
  haptics.tap();
  showInfoOverlay.value = true;
}
</script>

<template>
  <div class="header-wrapper" :class="{ 'is-scrolled': isScrolled }">
    <div class="console-glass">
      <div class="bloom-effect"></div>

      <!-- Top Row: Identity & Status -->
      <div class="header-row top">
        <div class="left-cluster">
          <!-- Title is now the Link -->
          <h1 class="view-title">
            <a
              v-if="sheetUrl"
              :href="sheetUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="title-link"
              @click="haptics.tap()"
            >
              {{ title }}
              <Icon name="spreadsheet" size="14" class="title-icon" />
            </a>
            <span v-else>{{ title }}</span>
          </h1>

          <div v-if="stats && !loading" class="stats-pill">
            <span class="sp-value">{{ stats.value }}</span>
            <span class="sp-label">{{ stats.label }}</span>
          </div>
          <div v-else-if="loading" class="sk-badge-m skeleton-anim"></div>
        </div>

        <StatusPill
          v-if="status && !loading"
          :type="status.type"
          :text="status.text"
          @refresh="$emit('refresh')"
        />
        <div v-else-if="loading" class="sk-pill skeleton-anim"></div>
      </div>

      <!-- Bottom Row: Controls -->
      <div v-if="showSearch" class="header-row bottom">
        <div class="search-container">
          <Icon name="search" class="input-icon" size="20" />
          <input
            v-if="!loading"
            type="text"
            class="glass-input"
            placeholder="Search..."
            autocomplete="off"
            @input="handleInput"
            aria-label="Search items"
          />
          <div v-else class="sk-input skeleton-anim"></div>
        </div>

        <div class="sort-group">
          <div class="sort-container">
            <Icon name="filter" size="16" class="sort-icon" />
            <select
              v-if="!loading"
              :value="currentSort"
              class="glass-select"
              :class="{ 'has-info': !!activeSortDescription }"
              @change="
                (e) =>
                  $emit('update:sort', (e.target as HTMLSelectElement).value)
              "
              aria-label="Sort by"
            >
              <template v-if="sortOptions">
                <option
                  v-for="opt in sortOptions"
                  :key="opt.value"
                  :value="opt.value"
                >
                  {{ opt.label }}
                </option>
              </template>
            </select>
            <div v-else class="sk-select skeleton-anim"></div>

            <button
              v-if="activeSortDescription && !loading"
              class="info-dot-inline"
              @click="openOverlay"
              aria-label="Sort Information"
            >
              <Icon name="info" size="16" />
            </button>
          </div>
        </div>
      </div>

      <!-- Extra Row: Selection Context -->
      <div
        v-if="$slots.extra || reserveExtraSpace"
        class="header-row extra"
        :class="{ reserved: reserveExtraSpace }"
      >
        <slot name="extra"></slot>
      </div>
    </div>

    <!-- Modular Expansion Overlay -->
    <HeaderInfoOverlay
      :show="showInfoOverlay"
      :content="activeSortDescription"
      @close="showInfoOverlay = false"
    />
  </div>
</template>

<style scoped>
.header-wrapper {
  position: sticky;
  top: var(--sys-safe-frame-offset, 0px);
  z-index: 100;
  padding: 12px var(--sys-safe-frame-offset, 0px);
  padding-top: calc(12px + env(safe-area-inset-top));
  box-sizing: border-box;
  transition: padding 0.4s var(--sys-motion-spring);
}

.header-wrapper.is-scrolled {
  padding-top: calc(6px + env(safe-area-inset-top));
  padding-bottom: 6px;
}

.console-glass {
  position: relative;
  background: var(--sys-surface-glass);
  backdrop-filter: var(--sys-surface-glass-blur);
  -webkit-backdrop-filter: var(--sys-surface-glass-blur);
  border: 1px solid var(--sys-surface-glass-border);
  border-radius: 24px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: var(--sys-elevation-2);
  overflow: hidden;
  transition: all 0.4s var(--sys-motion-spring);
}

.is-scrolled .console-glass {
  border-radius: 20px;
  padding: 12px 16px;
  background: rgba(var(--sys-color-surface-container-high-rgb), 0.85);
  box-shadow: var(--sys-elevation-3);
}

.bloom-effect {
  position: absolute;
  top: -100px;
  left: -50px;
  width: 250px;
  height: 250px;
  background: radial-gradient(circle, var(--sys-color-primary) 0%, transparent 70%);
  opacity: 0.1;
  pointer-events: none;
  transition: opacity 0.4s;
  z-index: 0;
}

.is-scrolled .bloom-effect {
  opacity: 0.18;
}

.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 12px;
  min-height: 44px;
}

.left-cluster {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 1;
}

.stats-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: var(--sys-color-surface-container-highest);
  border-radius: 8px;
  font-size: 11px;
  font-weight: 900;
  flex-shrink: 0;
  font-family: var(--sys-font-family-mono);
}

.sp-value {
  color: var(--sys-color-primary);
}

.sp-label {
  color: var(--sys-color-secondary);
  text-transform: uppercase;
  font-size: 8px;
  opacity: 0.8;
}

.icon-button {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--sys-color-primary);
  background: var(--sys-color-surface-container-high);
  transition: all 0.2s;
  flex-shrink: 0;
  border: 1px solid var(--sys-color-outline-variant);
}

.icon-button:active {
  transform: scale(0.9);
}

.search-container {
  position: relative;
  flex: 1; /* Allow shrinking */
  min-width: 120px;
}

.input-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--sys-color-outline);
  pointer-events: none;
  opacity: 0.7;
}

.glass-input {
  width: 100%;
  height: 40px;
  padding: 0 12px 0 40px;
  border-radius: 12px;
  background: var(--sys-color-surface-container-high);
  border: 1px solid transparent;
  color: var(--sys-color-on-surface);
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
}

.glass-input:focus {
  background: var(--sys-color-surface);
  border-color: var(--sys-color-primary);
  outline: none;
  box-shadow: 0 0 0 4px rgba(var(--sys-color-primary-rgb), 0.1);
}

.sort-group {
  flex: 1.3; /* Give Sort slightly more space for long options */
  min-width: 140px;
}

.sort-container {
  position: relative;
  width: 100%;
}

.glass-select {
  width: 100%;
  height: 40px;
  padding: 0 12px 0 36px;
  border-radius: 12px;
  background: var(--sys-color-surface-container-high);
  border: 1px solid var(--sys-color-outline-variant);
  font-size: 13px;
  font-weight: 800;
  color: var(--sys-color-on-surface);
  appearance: none;
  cursor: pointer;
  transition: all 0.2s;
}

.glass-select:focus {
  border-color: var(--sys-color-primary);
  outline: none;
}

.glass-select.has-info {
  padding-right: 36px;
}

.sort-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--sys-color-outline);
  pointer-events: none;
  opacity: 0.7;
}

.info-dot-inline {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: var(--sys-color-primary-container);
  color: var(--sys-color-on-primary-container);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
  z-index: 10;
}

.info-dot-inline:active {
  transform: translateY(-50%) scale(0.9);
}

.header-row.extra {
  margin-top: 4px;
  padding-top: 12px;
  border-top: 1px solid var(--sys-color-outline-variant);
  min-height: auto;
}

@media (max-width: 600px) {
  .header-wrapper {
    padding: 8px 0;
  }
  .console-glass {
    padding: 12px;
    border-radius: 16px;
    margin: 0;
    width: 100%;
    box-sizing: border-box;
  }
}

.title-link {
  display: flex;
  align-items: center;
  gap: 8px;
  color: inherit;
  text-decoration: none;
  position: relative;
}

.title-link::after {
  content: "";
  position: absolute;
  bottom: -2px;
  left: 0;
  width: 100%;
  height: 2px;
  background: var(--sys-color-primary);
  opacity: 0.3;
  transition: opacity 0.2s;
}

.title-icon {
  opacity: 0.5;
  transition: opacity 0.2s;
  color: var(--sys-color-primary);
}

.title-link:active {
  opacity: 0.7;
}

.title-link:active .title-icon {
  opacity: 1;
}
</style>
