<script setup lang="ts">
import { ref } from 'vue'
import Icon from './Icon.vue'

defineProps<{
  title: string
  status?: { type: 'updated' | 'error' | 'loading' | 'ready', text: string }
  showSearch?: boolean
  sheetUrl?: string
  stats?: { label: string, value: string }
}>()

const emit = defineEmits<{
  'update:search': [value: string]
  'update:sort': [value: string]
  'refresh': []
}>()

const sortValue = ref('score')
</script>

<template>
  <div class="header-wrapper">
    <div class="console-glass">
      
      <!-- Top Row: Title, Stats, Status -->
      <div class="header-row top">
        <div class="left-cluster">
            <h1 class="view-title">{{ title }}</h1>
            
            <div v-if="stats" class="stats-pill">
              <span class="sp-label">{{ stats.label }}</span>
              <span class="sp-separator"></span>
              <span class="sp-value">{{ stats.value }}</span>
            </div>

            <a 
              v-if="sheetUrl" 
              :href="sheetUrl" 
              target="_blank" 
              class="icon-button"
              title="Open in Sheets"
            >
               <Icon name="spreadsheet" size="18" />
            </a>
        </div>
        
        <button 
          v-if="status"
          class="status-pill" 
          :class="status.type"
          @click="emit('refresh')"
        >
          <div v-if="status.type === 'loading'" class="spinner"></div>
          <div v-else class="status-dot"></div>
          <span class="status-text">{{ status.text }}</span>
        </button>
      </div>

      <!-- Bottom Row: Search & Sort -->
      <div v-if="showSearch" class="header-row bottom">
        <div class="search-container">
          <Icon name="search" class="input-icon" size="20" />
          <input 
            type="text" 
            class="glass-input" 
            placeholder="Search..." 
            autocomplete="off"
            @input="e => emit('update:search', (e.target as HTMLInputElement).value)"
          >
        </div>
        
        <div class="sort-container">
          <span class="sort-label">Sort</span>
          <Icon name="filter" size="16" class="sort-icon" />
          <select 
            v-model="sortValue"
            class="glass-select" 
            @change="emit('update:sort', sortValue)"
          >
            <option value="score">Score</option>
            <option value="trophies">Trophies</option>
            <option value="name">Name</option>
          </select>
        </div>
      </div>
      
      <!-- Extra Slot (e.g. Selection Bar) -->
      <div v-if="$slots.extra" class="header-row extra">
        <slot name="extra"></slot>
      </div>
    </div>
  </div>
</template>

<style scoped>
.header-wrapper {
  position: sticky;
  top: calc(var(--spacing-s) + env(safe-area-inset-top));
  z-index: 100;
  margin-bottom: var(--spacing-l);
  /* Ensure it doesn't overflow horizontally */
  max-width: 100%;
}

.console-glass {
  background: var(--sys-surface-glass);
  backdrop-filter: var(--sys-surface-glass-blur);
  -webkit-backdrop-filter: var(--sys-surface-glass-blur);
  border: 1px solid var(--sys-surface-glass-border);
  border-radius: var(--shape-corner-l);
  box-shadow: var(--sys-elevation-2);
  padding: var(--spacing-m);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-m);
  transition: all 0.3s var(--sys-motion-spring);
}

/* --- ROW LAYOUTS --- */
.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.header-row.bottom {
  gap: var(--spacing-s);
}

.header-row.extra {
  padding-top: var(--spacing-s);
  border-top: 1px solid rgba(0,0,0,0.05);
}

/* --- TOP ROW ELEMENTS --- */
.left-cluster {
  display: flex;
  align-items: center;
  gap: var(--spacing-s);
}

.view-title {
  margin: 0;
  font-size: 24px; /* Fixed size for consistency */
  line-height: 1;
  font-weight: 800;
  color: var(--sys-color-on-surface);
  letter-spacing: -0.03em;
}

/* Stats Pill */
.stats-pill {
  display: flex;
  align-items: center;
  height: 24px;
  padding: 0 8px;
  background: var(--sys-color-surface-container-highest);
  border-radius: 6px;
  border: 1px solid rgba(255,255,255,0.1);
  font-size: 11px;
  font-weight: 700;
  color: var(--sys-color-on-surface-variant);
  user-select: none;
}

.sp-label {
  text-transform: uppercase;
  letter-spacing: 0.05em;
  opacity: 0.7;
}

.sp-separator {
  width: 1px;
  height: 8px;
  background: currentColor;
  opacity: 0.2;
  margin: 0 6px;
}

.sp-value {
  color: var(--sys-color-primary);
}

/* Icon Button (Small) */
.icon-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: transparent;
  color: var(--sys-color-primary);
  opacity: 0.6;
  transition: all 0.2s ease;
  border: 1px solid transparent;
}

.icon-button:hover {
  background: var(--sys-color-primary-container);
  opacity: 1;
  border-color: rgba(var(--sys-color-primary-rgb), 0.2);
}

/* Status Pill */
.status-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  border-radius: 14px;
  border: 1px solid transparent;
  background: var(--sys-color-surface-container);
  color: var(--sys-color-outline);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: all 0.2s ease;
}

.status-pill:hover {
  background: var(--sys-color-surface-container-high);
  transform: translateY(-1px);
}

.status-pill:active {
  transform: translateY(0);
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.status-pill.ready .status-dot { background: var(--sys-color-success); }
.status-pill.ready { color: var(--sys-color-on-surface); border-color: rgba(var(--sys-color-success), 0.2); }

.status-pill.error .status-dot { background: var(--sys-color-error); }
.status-pill.error { color: var(--sys-color-error); background: var(--sys-color-error-container); }

.spinner {
  width: 10px;
  height: 10px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

/* --- BOTTOM ROW (INPUTS) --- */
.search-container {
  position: relative;
  flex: 1;
  height: 44px; /* Standardized Height */
}

.input-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--sys-color-outline);
  pointer-events: none;
  z-index: 2;
}

.glass-input {
  width: 100%;
  height: 100%;
  padding: 0 16px 0 40px; /* Left padding clears icon */
  border-radius: 12px;
  border: 1px solid transparent;
  background: var(--sys-color-surface-container-high);
  color: var(--sys-color-on-surface);
  font-family: var(--sys-font-family-body);
  font-size: 14px;
  font-weight: 500;
  outline: none;
  transition: all 0.2s ease;
}

.glass-input:focus {
  background: var(--sys-color-surface);
  border-color: var(--sys-color-primary);
  box-shadow: 0 0 0 3px rgba(var(--sys-color-primary-rgb), 0.15);
}

.glass-input::placeholder {
  color: var(--sys-color-outline);
  opacity: 0.7;
}

/* Sort Dropdown */
.sort-container {
  position: relative;
  height: 44px; /* Matches Search */
  min-width: 120px;
}

.glass-select {
  width: 100%;
  height: 100%;
  padding: 0 36px 0 16px; /* Right padding clears caret, but we have custom layout */
  /* Actually for this specific design with label/icon inside: */
  padding: 0 16px 0 54px; /* Left padding for "Sort + Icon" */
  border-radius: 12px;
  border: 1px solid transparent;
  background: var(--sys-color-surface-container-high);
  color: var(--sys-color-on-surface);
  font-family: var(--sys-font-family-body);
  font-size: 14px;
  font-weight: 600;
  appearance: none;
  outline: none;
  cursor: pointer;
  transition: all 0.2s ease;
}

.glass-select:focus {
  background: var(--sys-color-surface);
  border-color: var(--sys-color-primary);
}

.sort-label {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--sys-color-outline);
  pointer-events: none;
}

.sort-icon {
  position: absolute;
  left: 42px; /* Position after label */
  top: 50%;
  transform: translateY(-50%);
  color: var(--sys-color-outline);
  opacity: 0.5;
  pointer-events: none;
}

/* Mobile Tweak: Ensure search and sort stack properly if space is tight? 
   No, side-by-side is better for usability. Flex handles it.
   But if screen is very small, search gets small.
*/
</style>
