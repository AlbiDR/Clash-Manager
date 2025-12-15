<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useApiState } from '../composables/useApiState'
import { useInstallPrompt } from '../composables/useInstallPrompt'
import ConsoleHeader from '../components/ConsoleHeader.vue'
import Icon from '../components/Icon.vue'

// Local state for the input field
const newApiUrl = ref('') 
const isEditing = ref(false)

const { 
    apiUrl, 
    apiStatus, 
    pingData, 
    checkApiStatus 
} = useApiState()

const { isInstallable, install } = useInstallPrompt()

onMounted(() => {
    checkApiStatus()
})

const hasLocalOverride = computed(() => {
  return !!localStorage.getItem('cm_gas_url')
})

function saveApiUrl() {
    if (newApiUrl.value.trim()) {
        localStorage.setItem('cm_gas_url', newApiUrl.value.trim())
        window.location.reload()
    }
}

function resetApiUrl() {
    if(confirm('Reset API URL to default?')) {
        localStorage.removeItem('cm_gas_url')
        window.location.reload()
    }
}

const apiStatusObject = computed(() => {
    if (apiStatus.value === 'online') return { type: 'ready', text: 'Systems Online' } as const
    if (apiStatus.value === 'offline') return { type: 'error', text: 'Disconnected' } as const
    return { type: 'loading', text: 'Ping...' } as const
})

const editorUrl = computed(() => {
    if (pingData.value?.scriptId) {
        return `https://script.google.com/home/projects/${pingData.value.scriptId}/edit`
    }
    return undefined
})
</script>

<template>
  <div class="view-container">
    <ConsoleHeader title="Settings" :status="apiStatusObject" />

    <div class="settings-content">
      
      <!-- PWA Install Banner -->
      <div v-if="isInstallable" class="install-banner" @click="install">
        <div class="ib-icon">
          <Icon name="download" size="24" style="color: white;" />
        </div>
        <div class="ib-text">
          <div class="ib-title">Install App</div>
          <div class="ib-desc">Add to Home Screen for the best experience</div>
        </div>
        <div class="ib-arrow">
          <Icon name="chevron_right" size="20" />
        </div>
      </div>

      <!-- Main Cards Stack (No Gap) -->
      <div class="cards-stack">
        
        <!-- 🌐 Unified Network Dashboard -->
        <section class="glass-panel top-card">
            <header class="card-header">
                <div class="icon-box">
                    <Icon name="plug" size="24" />
                </div>
                <div class="header-info">
                    <h2 class="card-title">Network & API</h2>
                    <p class="card-subtitle">Connection status and configuration</p>
                </div>
                <div class="status-pill" :class="apiStatus">
                    <div class="pulse-dot"></div>
                    {{ apiStatusObject.text }}
                </div>
            </header>

            <div class="card-body">
                <div class="network-stats">
                    <div class="stat-block">
                        <span class="label">Latency</span>
                        <span class="value">{{ pingData?.latency || '--' }}<small>ms</small></span>
                    </div>
                    <div class="stat-block">
                        <span class="label">Backend</span>
                        <span class="value">v{{ pingData?.version || '0.0' }}</span>
                    </div>
                    <div class="stat-block">
                        <span class="label">Environment</span>
                        <span class="value">{{ hasLocalOverride ? 'Custom' : 'Production' }}</span>
                    </div>
                </div>

                <div class="divider"></div>

                 <div class="field-group">
                    <div class="flex-between">
                        <label class="field-label">API Endpoint</label>
                        <button v-if="!isEditing" @click="isEditing = true" class="text-link">Change URL</button>
                        <button v-else @click="isEditing = false" class="text-link">Cancel</button>
                    </div>

                    <div v-if="!isEditing" class="endpoint-display">
                        <div class="url-text">{{ apiUrl }}</div>
                        <a v-if="editorUrl" :href="editorUrl" target="_blank" class="icon-link" title="Open GAS Editor">
                            <Icon name="spreadsheet" size="18" />
                        </a>
                    </div>

                    <div v-else class="input-row">
                        <input 
                            v-model="newApiUrl"
                            type="url" 
                            placeholder="https://script.google.com/..."
                            class="text-input"
                        />
                        <button class="save-btn" @click="saveApiUrl">
                            <Icon name="check" size="20" />
                        </button>
                    </div>
                    
                    <div v-if="hasLocalOverride" class="override-alert">
                        <Icon name="warning" size="16" />
                        <span>Running on custom override URL</span>
                        <button class="reset-link" @click="resetApiUrl">Reset</button>
                    </div>
                </div>
            </div>
        </section>
        
        <!-- 📦 System Modules (Tech Specs) -->
        <section class="glass-panel bottom-card" v-if="pingData?.modules">
            <header class="card-header">
                <div class="icon-box">
                    <Icon name="box" size="24" />
                </div>
                <div class="header-info">
                    <h2 class="card-title">System Modules</h2>
                    <p class="card-subtitle">Installed backend components</p>
                </div>
            </header>

            <!-- Specs Grid (Body) -->
            <div class="specs-grid">
                <div 
                    v-for="(version, name) in pingData.modules" 
                    :key="name"
                    class="spec-item"
                >
                    <span class="spec-label">{{ name }}</span>
                    <span class="spec-value">v{{ version }}</span>
                </div>
            </div>
        </section>
      </div>
        
      <!-- About Footer -->
      <footer class="about-footer">
          <div class="app-logo">
              <Icon name="crown" size="48" />
          </div>
          <h3 class="footer-title">Clash Manager</h3>
          <p class="footer-ver">v6.0.0 (Gold Master)</p>
          <div class="footer-links">
              <a href="https://github.com/albidr/Clash-Manager" target="_blank" class="github-btn">
                  <Icon name="github" size="18" />
                  <span>Source Code</span>
              </a>
          </div>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.view-container { 
    min-height: 100%;
}

.settings-content {
    max-width: var(--sys-layout-max-width);
    margin: 0 auto;
    padding: var(--spacing-l) 0 120px;
    display: flex;
    flex-direction: column;
    /* Main gap handling via stack below */
}

/* Stack Container for touching cards */
.cards-stack {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-l); /* Gap between the distinct card groups */
}

/* --- GLASS PANEL --- */
.glass-panel {
    background: var(--sys-surface-glass);
    backdrop-filter: var(--sys-surface-glass-blur);
    -webkit-backdrop-filter: var(--sys-surface-glass-blur);
    border: 1px solid var(--sys-surface-glass-border);
    border-radius: var(--shape-corner-l);
    overflow: hidden;
    box-shadow: var(--sys-elevation-2);
    transition: transform 0.4s var(--sys-motion-spring);
    animation: fadeSlideIn 0.6s backwards;
}

/* --- HEADER --- */
.card-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-m);
    padding: var(--spacing-l);
    background: linear-gradient(to bottom, rgba(255,255,255,0.05), transparent);
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.icon-box {
    width: 48px; height: 48px;
    border-radius: 16px;
    background: var(--sys-color-surface-container-high);
    color: var(--sys-color-primary);
    display: flex; align-items: center; justify-content: center;
    box-shadow: inset 0 0 0 1px rgba(255,255,255,0.1);
}

.header-info { flex: 1; }

.card-title {
    margin: 0;
    font-size: var(--font-size-l);
    font-weight: var(--font-weight-heavy);
    color: var(--sys-color-on-surface);
}
.card-subtitle {
    margin: 4px 0 0;
    font-size: var(--font-size-s);
    color: var(--sys-color-outline);
    font-weight: var(--font-weight-medium);
}

/* --- STATUS PILL --- */
.status-pill {
    display: flex; align-items: center; gap: 8px;
    padding: 6px 12px;
    border-radius: var(--shape-corner-full);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-bold);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background: var(--sys-color-surface-container);
    color: var(--sys-color-outline);
}
.pulse-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: currentColor;
    box-shadow: 0 0 8px currentColor;
}
.status-pill.online { color: var(--sys-color-success); background: rgba(var(--sys-rgb-success), 0.1); }
.status-pill.offline { color: var(--sys-color-error); background: rgba(var(--sys-rgb-error), 0.1); }

/* --- CARD BODY --- */
.card-body { padding: var(--spacing-l); }

.network-stats {
    display: grid; grid-template-columns: repeat(3, 1fr);
    gap: var(--spacing-m);
    margin-bottom: var(--spacing-l);
}
.stat-block {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    background: var(--sys-color-surface-container);
    padding: var(--spacing-m);
    border-radius: var(--shape-corner-m);
}
.stat-block .label { font-size: var(--font-size-xs); text-transform: uppercase; color: var(--sys-color-outline); margin-bottom: 4px; font-weight: 700; }
.stat-block .value { font-size: var(--font-size-l); font-weight: 800; color: var(--sys-color-on-surface); font-family: var(--sys-font-family-mono); }
.stat-block .value small { font-size: 0.6em; margin-left: 2px; opacity: 0.7; }

.divider { height: 1px; background: var(--sys-color-outline-variant); opacity: 0.2; margin-bottom: var(--spacing-l); }

/* --- FIELDS --- */
.field-group { display: flex; flex-direction: column; gap: var(--spacing-xs); }
.flex-between { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.field-label {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-bold);
    text-transform: uppercase;
    color: var(--sys-color-outline);
    letter-spacing: 0.05em;
}
.text-link {
    background: none; border: none; color: var(--sys-color-primary);
    font-weight: 600; font-size: var(--font-size-s); cursor: pointer;
}

.endpoint-display {
    display: flex; align-items: center; gap: var(--spacing-s);
    background: var(--sys-color-surface-container-high);
    padding: 12px;
    border-radius: var(--shape-corner-m);
    border: 1px solid transparent;
}
.url-text {
    flex: 1;
    font-family: var(--sys-font-family-mono);
    font-size: 13px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    color: var(--sys-color-on-surface-variant);
    opacity: 0.8;
}
.icon-link {
    color: var(--sys-color-primary); opacity: 0.7; transition: all 0.2s;
}
.icon-link:hover { opacity: 1; transform: scale(1.1); }

/* --- INPUTS --- */
.input-row { display: flex; gap: var(--spacing-s); }
.text-input {
    flex: 1;
    background: var(--sys-color-surface-container-high);
    border: 2px solid var(--sys-color-primary);
    padding: 10px 16px;
    border-radius: var(--shape-corner-m);
    color: var(--sys-color-on-surface);
    font-size: var(--font-size-m);
    font-family: var(--sys-font-family-mono);
}
.text-input:focus { outline: none; box-shadow: 0 0 0 4px rgba(var(--sys-color-primary-rgb), 0.2); }
.save-btn {
    width: 46px; border-radius: var(--shape-corner-m);
    background: var(--sys-color-primary); color: white; border: none;
    cursor: pointer; display: flex; align-items: center; justify-content: center;
}

.override-alert {
    display: flex; align-items: center; gap: 8px;
    font-size: var(--font-size-s); color: var(--sys-color-tertiary);
    background: var(--sys-color-tertiary-container);
    padding: 8px 12px; border-radius: var(--shape-corner-s);
    margin-top: 8px;
}
.reset-link {
    margin-left: auto; background: none; border: none;
    font-weight: 700; color: var(--sys-color-on-tertiary-container);
    cursor: pointer; text-decoration: underline;
}

/* --- MODULES GRID (TECH SPECS) --- */
.specs-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 1px;
    background: rgba(255,255,255,0.05); /* Grid Lines */
    /* Ensure no double borders */
    border-top: 1px solid rgba(255,255,255,0.05);
}

.spec-item {
    background: var(--sys-color-surface-container-low);
    padding: 16px;
    display: flex; flex-direction: column; gap: 4px;
}
.spec-label { font-size: 11px; text-transform: uppercase; color: var(--sys-color-outline); font-weight: 700; letter-spacing: 0.05em; }
.spec-value { font-size: 15px; font-weight: 700; color: var(--sys-color-primary); font-family: var(--sys-font-family-mono); }

/* --- FOOTER --- */
.about-footer {
    text-align: center;
    margin-top: var(--spacing-xl);
    color: var(--sys-color-outline);
    display: flex; flex-direction: column; align-items: center; gap: 8px;
}
.app-logo { color: var(--sys-color-primary); margin-bottom: 8px; }
.footer-title { margin: 0; font-size: var(--font-size-l); font-weight: 800; color: var(--sys-color-on-surface); }
.footer-ver { margin: 0; font-size: var(--font-size-s); font-family: var(--sys-font-family-mono); opacity: 0.6; }

/* Install Banner */
.install-banner {
  background: linear-gradient(135deg, var(--sys-color-primary) 0%, var(--sys-color-tertiary) 100%);
  border-radius: var(--shape-corner-l);
  padding: 16px;
  margin-bottom: 24px;
  display: flex; align-items: center; gap: 16px;
  color: white;
  cursor: pointer;
  box-shadow: var(--sys-elevation-3);
  transition: transform 0.2s;
}
.install-banner:active { transform: scale(0.98); }
.ib-icon {
  width: 40px; height: 40px;
  background: rgba(255,255,255,0.2);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
}
.ib-text { flex: 1; }
.ib-title { font-weight: 700; font-size: 16px; }
.ib-desc { font-size: 12px; opacity: 0.9; }
.ib-arrow { opacity: 0.8; }

.github-btn {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 16px;
    background: var(--sys-color-surface-container-high);
    border-radius: var(--shape-corner-full);
    color: var(--sys-color-on-surface);
    text-decoration: none;
    font-weight: 600; font-size: 14px;
    margin-top: 16px;
    transition: all 0.2s;
}
.github-btn:hover { background: var(--sys-color-surface-container-highest); transform: translateY(-2px); }
</style>
