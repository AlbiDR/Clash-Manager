<script setup lang="ts">
import { ref } from 'vue'
import Icon from './Icon.vue'

defineProps<{
  title: string
  status?: { type: 'updated' | 'error' | 'loading' | 'ready', text: string }
  showSearch?: boolean
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
      
      <!-- Top Row: Title & Status -->
      <div class="console-top">
        <div class="view-title">{{ title }}</div>
        
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
  top: calc(12px + env(safe-area-inset-top));
  z-index: 100;
  margin-bottom: 24px;
}

.console-glass {
  background: var(--sys-surface-glass);
  backdrop-filter: var(--sys-surface-glass-blur); -webkit-backdrop-filter: var(--sys-surface-glass-blur);
  border-radius: var(--shape-corner-l);
  box-shadow: var(--sys-elevation-2);
  border: 1px solid var(--sys-surface-glass-border);
  padding: 16px;
  position: relative;
  transition: all 0.4s var(--sys-motion-spring);
}

.console-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.view-title { font-size: 24px; font-weight: 700; color: var(--sys-color-on-surface); letter-spacing: -0.5px; }

/* Status Pill */
.status-badge {
  display: flex; align-items: center; gap: 8px;
  background: var(--sys-color-surface-container-high); 
  padding: 8px 16px;
  border-radius: var(--shape-corner-full);
  font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;
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
.input-group { display: flex; gap: 12px; }
.search-wrapper { position: relative; flex: 1; }
.search-input {
  width: 100%; height: 56px;
  background: var(--sys-color-surface-container-high);
  border: 2px solid transparent; border-radius: var(--shape-corner-full);
  padding: 0 16px 0 52px;
  font-size: 16px; color: var(--sys-color-on-surface); font-family: var(--sys-typescale-body);
  outline: none; transition: all 0.2s;
}
.search-input:focus { border-color: var(--sys-color-primary); background: var(--sys-color-surface); }
.search-icon { position: absolute; left: 18px; top: 18px; color: var(--sys-color-on-surface-variant); pointer-events: none; }

.filter-toggle {
  height: 56px; padding: 0 24px;
  background: var(--sys-color-surface-container-high); color: var(--sys-color-on-surface-variant);
  border-radius: var(--shape-corner-full);
  display: flex; align-items: center; gap: 8px;
  font-weight: 600; font-size: 14px; position: relative;
  cursor: pointer; transition: background 0.2s;
}
.sort-native { position: absolute; top:0; left:0; width:100%; height:100%; opacity:0; cursor:pointer; }
</style>
