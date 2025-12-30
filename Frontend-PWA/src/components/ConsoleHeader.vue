
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
  currentSort?: string
  loading?: boolean
}>()

const emit = defineEmits<{
  'update:search': [value: string]
  'update:sort': [value: string]
  'refresh': []
}>()

const { modules } = useModules()
const isScrolled = ref(false)
const showInfoOverlay = ref(false)
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
  const selected = props.sortOptions?.find(opt => opt.value === props.currentSort)
  return selected?.desc || null
})

function formatDescription(text: string) {
  if (!text) return ''
  
  return text
    // Section headers (Key: Value or Title:)
    .replace(/^(\*\*.*?\*\*|.*?:)$/gm, '<div class="desc-section-title">$1</div>')
    // Bold text (**text**)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Bullet points (• item)
    .replace(/^• (.+)$/gm, '<li class="bullet-item">$1</li>')
    // Line breaks
    .replace(/\\n/g, '<br>')
    // Wrap lists in ul
    .replace(/(<li class="bullet-item">.*<\/li>\s*)+/g, '<ul class="desc-list">$&</ul>')
}
</script>

<template>
  <div class="header-wrapper" :class="{ 'is-scrolled': isScrolled }">
    <div class="console-glass">
      <div class="bloom-effect"></div>
      
      <div class="header-row top">
        <div class="left-cluster">
            <a 
              v-if="sheetUrl && !loading" 
              :href="sheetUrl" 
              target="_blank" 
              class="icon-button" 
              title="Open in Sheets"
              aria-label="Open Google Sheet"
            >
               <Icon name="spreadsheet" size="20" />
            </a>
            
            <!-- ⚡ LCP OPTIMIZATION: Use global .view-title class (defined in style.css) to match Static HTML Shell -->
            <h1 class="view-title">{{ title }}</h1>

            <div v-if="stats && !loading" class="stats-pill">
              <span class="sp-value">{{ stats.value }}</span>
              <span class="sp-label">{{ stats.label }}</span>
            </div>
            <div v-else-if="loading" class="sk-badge-m skeleton-anim"></div>
        </div>
        
        <button v-if="status && !loading" class="status-pill" :class="status.type" @click="emit('refresh')">
          <div v-if="status.type === 'loading'" class="spinner"></div>
          <div v-else class="status-dot"></div>
          <span class="status-text">{{ status.text }}</span>
        </button>
        <div v-else-if="loading" class="sk-pill skeleton-anim"></div>
      </div>

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
          >
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
              @change="(e) => emit('update:sort', (e.target as HTMLSelectElement).value)"
              aria-label="Sort by"
            >
              <template v-if="sortOptions">
                <option v-for="opt in sortOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </template>
            </select>
            <div v-else class="sk-select skeleton-anim"></div>
            <button 
                v-if="activeSortDescription && !loading" 
                class="info-dot-inline" 
                @click="showInfoOverlay = true"
                aria-label="Sort Information"
            >
                <Icon name="info" size="16" />
            </button>
          </div>
        </div>
      </div>
      
      <!-- Rich Info Overlay -->
      <Transition name="overlay-fade">
        <div v-if="showInfoOverlay && activeSortDescription" class="info-overlay" @click.self="showInfoOverlay = false">
            <div class="info-card glassmorphic">
                <div class="info-header">
                    <h3>Sorting Explanation</h3>
                    <button class="close-btn" @click="showInfoOverlay = false">
                        <Icon name="close" size="20" />
                    </button>
                </div>
                <div class="info-content scrollable-area" v-html="formatDescription(activeSortDescription)"></div>
            </div>
        </div>
      </Transition>
      
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

/* 🛡️ CLS PREVENTION: Fixed minimum height prevents shifting */
.header-row { 
  display: flex; 
  align-items: center; 
  justify-content: space-between; 
  width: 100%; 
  gap: 12px;
  min-height: 48px; 
}

.left-cluster { display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1; }

/* NOTE: .view-title style removed from scoped block. It is now in global style.css */

/* Skeleton title style */
.sk-header-title {
  height: 24px; /* Matches view-title font-size */
  width: 160px; /* Representative width */
  margin: 0;
  border-radius: 4px;
  flex-shrink: 0;
}

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
.sp-label { color: var(--sys-color-secondary); text-transform: uppercase; font-size: 9px; }

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
  /* CLS Fix: Min width prevents jitter when text changes length */
  min-width: 80px; 
  justify-content: center;
}
.status-pill.ready { color: var(--sys-color-success); background: var(--sys-color-success-container); }
.status-pill.error { color: var(--sys-color-error); background: var(--sys-color-error-container); }

.status-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }

/* Mobile Optimizations */
@media (max-width: 600px) {
  .console-glass { padding: 14px; gap: 12px; }
  /* .view-title size handled globally in style.css */
  .status-pill { padding: 6px 10px; gap: 6px; min-width: 60px; }
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
  cursor: pointer;
  border: none;
  opacity: 0.9;
  transition: transform 0.2s, opacity 0.2s;
  z-index: 10;
}
.info-dot-inline:hover { transform: translateY(-50%) scale(1.1); opacity: 1; }

/* Info Overlay Styles */
.info-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.4);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
}

.info-card {
    width: 100%;
    max-width: 480px;
    background: var(--sys-surface-glass);
    border: 1px solid var(--sys-surface-glass-border);
    border-radius: 24px;
    padding: 24px;
    box-shadow: var(--sys-elevation-4);
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-height: 80vh;
}

.info-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.info-header h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 850;
    color: var(--sys-color-primary);
    letter-spacing: -0.01em;
}

.info-content {
    font-size: 14px;
    line-height: 1.6;
    color: var(--sys-color-on-surface-variant);
}

:deep(.desc-section-title) {
    font-weight: 850;
    color: var(--sys-color-on-surface);
    text-transform: uppercase;
    font-size: 11px;
    letter-spacing: 0.05em;
    margin-top: 16px;
    margin-bottom: 8px;
    opacity: 0.8;
}

:deep(.bullet-item) {
    margin-left: 12px;
    padding-left: 4px;
}

:deep(.desc-list) {
    margin: 8px 0;
    padding: 0;
    list-style-type: none;
}

:deep(strong) {
    color: var(--sys-color-on-surface);
    font-weight: 700;
}

.close-btn {
    background: var(--sys-color-surface-container-high);
    border: none;
    width: 36px; height: 36px;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    color: var(--sys-color-outline);
    cursor: pointer;
    transition: 0.2s;
}
.close-btn:hover { background: var(--sys-color-surface-container-highest); color: var(--sys-color-on-surface); }

/* Transitions */
.overlay-fade-enter-active, .overlay-fade-leave-active { transition: opacity 0.3s ease; }
.overlay-fade-enter-from, .overlay-fade-leave-to { opacity: 0; }
.overlay-fade-enter-active .info-card { transition: transform 0.3s var(--sys-motion-spring); }
.overlay-fade-enter-from .info-card { transform: scale(0.9) translateY(20px); }

.spinner {
  width: 12px; height: 12px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
