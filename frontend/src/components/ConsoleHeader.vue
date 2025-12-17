<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import Icon from './Icon.vue'

defineProps<{
  title: string
  status?: { type: 'updated' | 'error' | 'loading' | 'ready', text: string }
  showSearch?: boolean
  sheetUrl?: string
  stats?: { label: string, value: string }
  sortOptions?: { label: string, value: string }[]
}>()

const emit = defineEmits<{
  'update:search': [value: string]
  'update:sort': [value: string]
  'refresh': []
}>()

const sortValue = ref('score')
const isScrolled = ref(false)

const handleScroll = () => {
  isScrolled.value = window.scrollY > 20
}

onMounted(() => window.addEventListener('scroll', handleScroll))
onUnmounted(() => window.removeEventListener('scroll', handleScroll))
</script>

<template>
  <div class="header-wrapper" :class="{ 'is-scrolled': isScrolled }">
    <div class="console-glass">
      <!-- Decorative Background Bloom -->
      <div class="bloom-effect"></div>
      
      <div class="header-row top">
        <div class="left-cluster">
            <a v-if="sheetUrl" :href="sheetUrl" target="_blank" class="icon-button" title="Open in Sheets">
               <Icon name="spreadsheet" size="18" />
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
          <input type="text" class="glass-input" placeholder="Search..." autocomplete="off" @input="e => emit('update:search', (e.target as HTMLInputElement).value)">
        </div>
        
        <div class="sort-container">
          <Icon name="filter" size="16" class="sort-icon" />
          <select v-model="sortValue" class="glass-select" @change="emit('update:sort', sortValue)">
            <template v-if="sortOptions">
              <option v-for="opt in sortOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </template>
          </select>
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
  top: env(safe-area-inset-top);
  z-index: 100;
  padding: 12px 0;
  transition: padding 0.3s var(--sys-motion-spring);
}

.header-wrapper.is-scrolled {
  padding: 4px 0;
}

.console-glass {
  position: relative;
  background: var(--sys-surface-glass);
  backdrop-filter: var(--sys-surface-glass-blur);
  -webkit-backdrop-filter: var(--sys-surface-glass-blur);
  border: 1px solid var(--sys-surface-glass-border);
  border-radius: var(--shape-corner-l);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: var(--sys-elevation-2);
  overflow: hidden;
}

.bloom-effect {
  position: absolute;
  top: -50px; left: -20px;
  width: 150px; height: 150px;
  background: var(--sys-color-primary);
  filter: blur(80px);
  opacity: 0.12;
  pointer-events: none;
}

.header-row { display: flex; align-items: center; justify-content: space-between; width: 100%; gap: 12px; }

.left-cluster { display: flex; align-items: center; gap: 12px; }

.view-title {
  margin: 0;
  font-size: 26px;
  font-weight: 850;
  color: var(--sys-color-on-surface);
  letter-spacing: -0.04em;
  transition: font-size 0.3s var(--sys-motion-spring);
}

.is-scrolled .view-title { font-size: 20px; }

.stats-pill {
  display: flex; align-items: center; gap: 6px;
  padding: 4px 10px;
  background: var(--sys-color-surface-container-highest);
  border-radius: 8px;
  font-size: 12px;
  font-weight: 800;
}
.sp-value { color: var(--sys-color-primary); }
.sp-label { opacity: 0.6; text-transform: uppercase; font-size: 10px; }

.icon-button {
  width: 32px; height: 32px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  color: var(--sys-color-primary);
  background: var(--sys-color-surface-container-high);
}

.status-pill {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  background: var(--sys-color-surface-container);
  color: var(--sys-color-outline);
  border: 1px solid transparent;
}
.status-pill.ready { color: var(--sys-color-success); border-color: rgba(var(--sys-color-success), 0.2); }
.status-pill.error { color: var(--sys-color-error); background: var(--sys-color-error-container); }

.status-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }

.search-container { position: relative; flex: 1; }
.input-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: var(--sys-color-outline); pointer-events: none; }

.glass-input {
  width: 100%; height: 44px;
  padding: 0 16px 0 44px;
  border-radius: 14px;
  background: var(--sys-color-surface-container-high);
  border: 1.5px solid transparent;
  color: var(--sys-color-on-surface);
  font-size: 15px;
  transition: all 0.2s;
}
.glass-input:focus { background: var(--sys-color-surface); border-color: var(--sys-color-primary); outline: none; }

.sort-container { position: relative; width: 140px; }
.glass-select {
  width: 100%; height: 44px;
  padding: 0 12px 0 38px;
  border-radius: 14px;
  background: var(--sys-color-surface-container-high);
  border: none;
  font-size: 13px; font-weight: 700;
  color: var(--sys-color-on-surface);
  appearance: none;
}
.sort-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: var(--sys-color-outline); pointer-events: none; }

.spinner {
  width: 12px; height: 12px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
