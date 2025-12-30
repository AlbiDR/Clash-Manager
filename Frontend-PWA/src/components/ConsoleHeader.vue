
<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
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
onUnmounted(() => {
    window.removeEventListener('scroll', handleScroll)
    document.body.style.overflow = ''
})

watch(showInfoOverlay, (val) => {
    if (val) {
        document.body.style.overflow = 'hidden'
    } else {
        document.body.style.overflow = ''
    }
})

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
    // Actual Line breaks (handle both literal \n and encoded ones)
    .replace(/\n/g, '<br>')
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
      
      <!-- Rich Info Overlay (Integrated Console Expansion) -->
      <Teleport to="body">
        <Transition name="console-expand">
          <div v-if="showInfoOverlay && activeSortDescription" class="info-overlay" @click.self="showInfoOverlay = false">
              <div class="info-card-expanded glassmorphic">
                  <div class="expansion-header">
                      <div class="expansion-title-group">
                        <Icon name="info" size="18" class="ext-icon" />
                        <h3>Heuristic Analysis</h3>
                      </div>
                      <button class="close-btn-round" @click="showInfoOverlay = false" aria-label="Close">
                          <Icon name="close" size="20" />
                      </button>
                  </div>
                  
                  <div class="expansion-content scrollable-area" v-html="formatDescription(activeSortDescription)"></div>
              </div>
          </div>
        </Transition>
      </Teleport>
      
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

/* Info Overlay Styles - Expanded Native Feel */
.info-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    z-index: 2000;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding: 16px; 
    padding-top: calc(16px + env(safe-area-inset-top));
    touch-action: none;
}

.info-card-expanded {
    width: 100%;
    max-width: var(--sys-layout-max-width);
    height: auto;
    max-height: 85vh; /* Safe cap for very long lists */
    background: var(--sys-surface-glass);
    border: 1px solid var(--sys-surface-glass-border);
    border-radius: 32px;
    padding: 24px;
    box-shadow: var(--sys-elevation-4);
    display: flex;
    flex-direction: column;
    gap: 16px;
    transform-origin: top;
    position: relative;
    overflow: hidden;
}

.expansion-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-shrink: 0;
}

.expansion-title-group {
    display: flex;
    align-items: center;
    gap: 12px;
}

.ext-icon { color: var(--sys-color-primary); }

.expansion-header h3 {
    margin: 0;
    font-size: 20px;
    font-weight: 950;
    color: var(--sys-color-on-surface);
    letter-spacing: -0.03em;
}

.expansion-content {
    font-size: 15px;
    line-height: 1.7;
    color: var(--sys-color-on-surface-variant);
    overflow-y: auto;
    padding-right: 12px;
    -webkit-overflow-scrolling: touch;
    flex: 1;
    user-select: text !important;
    -webkit-user-select: text !important;
}

.expansion-content :deep(*) {
    user-select: text !important;
    -webkit-user-select: text !important;
}

/* Custom Scrollbar for Posh look */
.expansion-content::-webkit-scrollbar { width: 4px; }
.expansion-content::-webkit-scrollbar-track { background: transparent; }
.expansion-content::-webkit-scrollbar-thumb { 
    background: var(--sys-color-outline-variant); 
    border-radius: 10px; 
}

:deep(.desc-section-title) {
    font-weight: 900;
    color: var(--sys-color-primary);
    text-transform: uppercase;
    font-size: 11px;
    letter-spacing: 0.08em;
    margin-top: 24px;
    margin-bottom: 12px;
    display: flex;
    align-items: center;
}
:deep(.desc-section-title)::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--sys-color-outline-variant);
    margin-left: 12px;
    opacity: 0.3;
}

:deep(.bullet-item) {
    margin-left: 4px;
    margin-bottom: 8px;
    padding-left: 20px;
    position: relative;
}
:deep(.bullet-item)::before {
    content: '→';
    position: absolute;
    left: 0;
    color: var(--sys-color-primary);
    font-weight: 900;
    opacity: 0.6;
}

:deep(.desc-list) {
    margin: 12px 0;
    padding: 0;
    list-style-type: none;
}

:deep(strong) {
    color: var(--sys-color-on-surface);
    font-weight: 850;
}

.close-btn-round {
    background: var(--sys-color-surface-container-highest);
    border: none;
    width: 40px; height: 40px;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    color: var(--sys-color-on-surface);
    cursor: pointer;
    transition: 0.2s;
}
.close-btn-round:active { transform: scale(0.9); }

/* Expansion Transition */
.console-expand-enter-active, .console-expand-leave-active { 
    transition: opacity 0.4s ease, transform 0.4s var(--sys-motion-spring); 
}
.console-expand-enter-from, .console-expand-leave-to { 
    opacity: 0;
    transform: translateY(-20px) scaleY(0.95);
}
.console-expand-enter-active .info-card-expanded {
    transition: transform 0.5s var(--sys-motion-spring);
}
.console-expand-enter-from .info-card-expanded {
    transform: translateY(-100%);
}

.spinner {
  width: 12px; height: 12px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
