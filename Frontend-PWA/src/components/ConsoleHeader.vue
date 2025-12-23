
<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import Icon from './Icon.vue'
import { useModules } from '../composables/useModules'

const props = defineProps<{
  title: string
  status?: { type: 'updated' | 'error' | 'loading' | 'ready', text: string }
  showSearch?: boolean
  sheetUrl?: string
  stats?: { label: string, value: string }
  sortOptions?: { label: string, value: string, desc?: string }[]
}>()

const emit = defineEmits<{
  'update:search': [value: string]
  'update:sort': [value: string]
  'refresh': []
}>()

const { modules } = useModules()
const sortValue = ref('score')
const isScrolled = ref(false)
let debounceTimer: number | null = null

const handleScroll = () => {
  isScrolled.value = window.scrollY > 20
}

const handleInput = (e: Event) => {
  const val = (e.target as HTMLInputElement).value
  if (debounceTimer) clearTimeout(debounceTimer)
  
  // Debounce search by 300ms to improve rendering performance on large lists
  debounceTimer = window.setTimeout(() => {
    emit('update:search', val)
  }, 300)
}

onMounted(() => window.addEventListener('scroll', handleScroll))
onUnmounted(() => window.removeEventListener('scroll', handleScroll))

const activeSortDescription = computed(() => {
  if (!modules.value.sortExplanation) return null
  const selected = props.sortOptions?.find(opt => opt.value === sortValue.value)
  return selected?.desc || null
})
</script>

<template>
  <div class="header-wrapper" :class="{ 'is-scrolled': isScrolled }">
    <div class="console-glass">
      <div class="bloom-effect"></div>
      
      <div class="header-row top">
        <div class="left-cluster">
            <a 
              v-if="sheetUrl" 
              :href="sheetUrl" 
              target="_blank" 
              class="icon-button" 
              title="Open in Sheets"
              aria-label="Open Google Sheet"
            >
               <Icon name="spreadsheet" size="20" />
            </a>
            <h1 class="view-title">{{ title }}</h1>
            <div v-if="stats" class="stats-pill">
              <span class="sp-value">{{ stats.value }}</span>
              <span class="sp-label">{{ stats.label }}</span>
            </div>
        </div>
        
        <button v-if="status" class="status-pill" :class="status.type" @click="emit('refresh')">
          <div v-if="status.type === 'loading'" class="spinner"></div>
          <div v-else class="status-dot"></div>
          <span class="status-text">{{ status.text }}</span>
        </button>
      </div>

      <div v-if="showSearch" class="header-row bottom">
        <div class="search-container">
          <Icon name="search" class="input-icon" size="20" />
          <input 
            type="text" 
            class="glass-input" 
            placeholder="Search..." 
            autocomplete="off" 
            @input="handleInput"
            aria-label="Search items"
          >
        </div>
        
        <div class="sort-group">
          <div class="sort-container">
            <Icon name="filter" size="16" class="sort-icon" />
            <select 
              v-model="sortValue" 
              class="glass-select" 
              :class="{ 'has-info': !!activeSortDescription }" 
              @change="emit('update:sort', sortValue)"
              aria-label="Sort by"
            >
              <template v-if="sortOptions">
                <option v-for="opt in sortOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </template>
            </select>
            <div 
                v-if="activeSortDescription" 
                class="info-dot-inline" 
                v-tooltip="activeSortDescription"
            >
                <Icon name="info" size="16" />
            </div>
          </div>
        </div>
      </div>
      
      <div v-if="$slots.extra" class="header-row extra">
        <slot name="extra"></slot>
      </div>
    </div>
  </div>
</template>

<style scoped>
.header-wrapper {
  position: sticky;
  top: 0;
  z-index: 100;
  padding: 12px 0;
  padding-top: calc(12px + env(safe-area-inset-top));
  transition: padding 0.3s var(--sys-motion-spring);
}
.header-wrapper.is-scrolled { 
  padding: 4px 0; 
  padding-top: calc(4px + env(safe-area-inset-top));
}

.console-glass {
  position: relative;
  background: var(--sys-surface-glass);
  backdrop-filter: var(--sys-surface-glass-blur);
  -webkit-backdrop-filter: var(--sys-surface-glass-blur);
  border: 1px solid var(--sys-surface-glass-border);
  border-radius: var(--shape-corner-l);
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-shadow: var(--sys-elevation-2);
  overflow: hidden;
}

.bloom-effect {
  position: absolute;
  top: -50px; left: -20px;
  width: 150px; height: 150px;
  background: var(--sys-color-primary);
  filter: blur(80px);
  opacity: 0.1;
  pointer-events: none;
}

.header-row { display: flex; align-items: center; justify-content: space-between; width: 100%; gap: 12px; }
.left-cluster { display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1; }

.view-title {
  margin: 0;
  font-size: 24px;
  font-weight: 900;
  color: var(--sys-color-on-surface);
  letter-spacing: -0.03em;
  transition: font-size 0.3s var(--sys-motion-spring);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.is-scrolled .view-title { font-size: 18px; }

.stats-pill {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 12px;
  background: var(--sys-color-surface-container-highest);
  border-radius: 10px;
  font-size: 12px;
  font-weight: 850;
  flex-shrink: 0;
}
.sp-value { color: var(--sys-color-primary); }
.sp-label { opacity: 0.5; text-transform: uppercase; font-size: 9px; }

.icon-button {
  width: 48px; height: 48px;
  border-radius: 14px;
  display: flex; align-items: center; justify-content: center;
  color: var(--sys-color-primary);
  background: var(--sys-color-surface-container-high);
  transition: 0.2s;
  flex-shrink: 0;
}
.icon-button:active { transform: scale(0.92); }

.status-pill {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 14px;
  border-radius: 99px;
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  background: var(--sys-color-surface-container);
  color: var(--sys-color-outline);
  border: 1px solid transparent;
  white-space: nowrap;
  flex-shrink: 0;
}
.status-pill.ready { color: var(--sys-color-success); background: var(--sys-color-success-container); }
.status-pill.error { color: var(--sys-color-error); background: var(--sys-color-error-container); }

.status-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }

/* Mobile Optimizations */
@media (max-width: 600px) {
  .console-glass { padding: 14px; gap: 12px; }
  .view-title { font-size: 20px; }
  .status-pill { padding: 6px 10px; gap: 6px; }
  .left-cluster { gap: 8px; }
  .stats-pill { padding: 4px 8px; }
}

.search-container { position: relative; flex: 1; }
.input-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: var(--sys-color-outline); pointer-events: none; }

.glass-input {
  width: 100%; height: 46px;
  padding: 0 16px 0 44px;
  border-radius: 14px;
  background: var(--sys-color-surface-container-high);
  border: 1.5px solid transparent;
  color: var(--sys-color-on-surface);
  font-size: 15px;
  transition: all 0.2s;
}
.glass-input:focus { background: var(--sys-color-surface); border-color: var(--sys-color-primary); outline: none; }

.sort-group { display: flex; align-items: center; gap: 8px; }
.sort-container { position: relative; width: 180px; }
.glass-select {
  width: 100%; height: 46px;
  padding: 0 12px 0 38px;
  border-radius: 14px;
  background: var(--sys-color-surface-container-high);
  border: none;
  font-size: 13px; font-weight: 800;
  color: var(--sys-color-on-surface);
  appearance: none;
  cursor: pointer;
  transition: padding-right 0.2s;
}
/* If info icon is present, add padding to avoid text overlap */
.glass-select.has-info { padding-right: 42px; }

.sort-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: var(--sys-color-outline); pointer-events: none; }

.info-dot-inline {
  position: absolute;
  right: 14px; top: 50%;
  transform: translateY(-50%);
  width: 24px; height: 24px;
  border-radius: 50%;
  background: var(--sys-color-secondary-container);
  color: var(--sys-color-on-secondary-container);
  display: flex; align-items: center; justify-content: center;
  cursor: help;
  opacity: 0.9;
  transition: transform 0.2s, opacity 0.2s;
  z-index: 10;
  pointer-events: auto; /* Ensure it captures events over select if overlapping slightly */
}
.info-dot-inline:hover { transform: translateY(-50%) scale(1.1); opacity: 1; }

.spinner {
  width: 12px; height: 12px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
