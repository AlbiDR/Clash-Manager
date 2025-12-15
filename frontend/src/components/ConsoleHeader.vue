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
      
      <!-- Top Row: Title & Action -->
      <div class="console-top">
        <div class="left-group">
            <div class="view-title">{{ title }}</div>
            <!-- NEW: Stats Badge if present -->
            <div v-if="stats" class="count-badge">
              <span class="cb-label">{{ stats.label }}</span>
              <span class="cb-value">{{ stats.value }}</span>
            </div>
            <!-- Open in Sheets Button -->
            <a 
              v-if="sheetUrl" 
              :href="sheetUrl" 
              target="_blank" 
              class="action-icon"
              title="Open in Sheets"
            >
               <Icon name="spreadsheet" size="18" />
            </a>
        </div>
        
        <div 
          v-if="status"
          class="status-badge" 
          :class="status.type"
          @click="emit('refresh')"
        >
          <div v-if="status.type === 'loading'" class="spinner"></div>
          <span>{{ status.text }}</span>
        </div>
      </div>

      <!-- Bottom Row: Search & Filter -->
      <div v-if="showSearch" class="input-group">
        <div class="search-wrapper">
          <Icon name="search" class="search-icon" size="20" />
          <input 
            type="text" 
            class="search-input" 
            placeholder="Search..." 
            autocomplete="off"
            @input="e => emit('update:search', (e.target as HTMLInputElement).value)"
          >
        </div>
        
        <div class="filter-toggle">
          <span>Sort</span>
          <Icon name="filter" size="16" style="opacity:0.6" />
          <select 
            v-model="sortValue"
            class="sort-native" 
            @change="emit('update:sort', sortValue)"
          >
            <option value="score">Score</option>
            <option value="trophies">Trophies</option>
            <option value="name">Name</option>
          </select>
        </div>
      </div>
      
      <slot name="extra"></slot>
    </div>
  </div>
</template>

<style scoped>
/* 🛸 Floating Console Header */
.header-wrapper {
  position: sticky;
  /* Top position + Safe Area (Status Bar) */
  top: calc(var(--spacing-s) + env(safe-area-inset-top));
  z-index: 100;
  margin-bottom: var(--spacing-l);
}

.console-glass {
  background: var(--sys-surface-glass);
  backdrop-filter: var(--sys-surface-glass-blur); -webkit-backdrop-filter: var(--sys-surface-glass-blur);
  border-radius: var(--shape-corner-l);
  box-shadow: var(--sys-elevation-2);
  border: 1px solid var(--sys-surface-glass-border);
  padding: var(--spacing-m);
  position: relative;
  transition: all 0.4s var(--sys-motion-spring);
}

.console-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--spacing-m); }

.view-title { 
  font-size: var(--font-size-xl); 
  font-weight: var(--font-weight-heavy); 
  color: var(--sys-color-on-surface); 
  letter-spacing: -0.02em; 
}

/* Stats Pill */
.count-badge {
  display: flex; align-items: center; gap: 4px;
  background: var(--sys-color-surface-container-highest);
  padding: 2px 8px; border-radius: 6px;
  font-size: 11px; font-weight: 700;
  border: 1px solid rgba(0,0,0,0.05);
}
.cb-label { text-transform: uppercase; color: var(--sys-color-outline); font-size: 9px; letter-spacing: 0.5px; }
.cb-value { color: var(--sys-color-on-surface); }

/* Status Pill */
.status-badge {
  display: flex; align-items: center; gap: var(--spacing-xs);
  background: var(--sys-color-surface-container-high); 
  padding: var(--spacing-xs) var(--spacing-m);
  border-radius: var(--shape-corner-full);
  font-size: var(--font-size-xs); font-weight: var(--font-weight-bold); 
  text-transform: uppercase; letter-spacing: 0.05em;
  color: var(--sys-color-on-surface-variant); cursor: pointer;
  transition: all 0.2s var(--sys-motion-bouncy);
}
.status-badge:active { transform: scale(0.95); }
.status-badge.updated { background: var(--sys-color-primary-container); color: var(--sys-color-on-primary-container); }
.status-badge.error { background: var(--sys-color-error-container); color: var(--sys-color-on-error-container); }

.spinner { 
  width: 12px; height: 12px; 
  border: 2px solid currentColor; border-top-color: transparent; border-radius: 50%; 
  animation: spin 0.8s linear infinite; 
}

/* Input Fields */
.input-group { display: flex; gap: var(--spacing-s); }
.search-wrapper { position: relative; flex: 1; }

.search-input {
  width: 100%; height: 56px;
  background: var(--sys-color-surface-container-high);
  border: 2px solid transparent; border-radius: var(--shape-corner-full);
  padding: 0 var(--spacing-m) 0 52px;
  font-size: var(--font-size-m); color: var(--sys-color-on-surface); 
  font-family: var(--sys-typescale-body);
  outline: none; transition: all 0.2s;
}
.search-input:focus { border-color: var(--sys-color-primary); background: var(--sys-color-surface); }
.search-icon { 
  position: absolute; left: 18px; top: 18px; 
  color: var(--sys-color-on-surface-variant); pointer-events: none; 
}

.filter-toggle {
  height: 56px; padding: 0 var(--spacing-l);
  background: var(--sys-color-surface-container-high); color: var(--sys-color-on-surface-variant);
  border-radius: var(--shape-corner-full);
  display: flex; align-items: center; gap: var(--spacing-xs);
  font-weight: var(--font-weight-bold); font-size: var(--font-size-s); position: relative;
  cursor: pointer; transition: background 0.2s;
}
.sort-native { position: absolute; top:0; left:0; width:100%; height:100%; opacity:0; cursor:pointer; }

.left-group { display: flex; align-items: center; gap: var(--spacing-s); }

.action-icon {
  display: flex; align-items: center; justify-content: center;
  width: 32px; height: 32px;
  background: var(--sys-color-surface-container-high);
  border-radius: 50%;
  color: var(--sys-color-primary);
  text-decoration: none;
  transition: all 0.2s var(--sys-motion-bouncy);
}
.action-icon:hover {
  background: var(--sys-color-primary-container);
  color: var(--sys-color-on-primary-container);
  transform: scale(1.1);
}
</style>
