<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useApiState } from '../composables/useApiState'
import ConsoleHeader from '../components/ConsoleHeader.vue'

// Local state for the input field
const newApiUrl = ref('') 

// Use the centralized composable for all API-related reactive data
const { 
    apiUrl, 
    apiStatus, 
    pingData, 
    checkApiStatus 
} = useApiState()

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

const apiStatusText = computed(() => {
    if (apiStatus.value === 'online') return 'Online'
    if (apiStatus.value === 'offline') return 'Offline'
    return 'Checking...'
})
</script>

<template>
  <div class="view-container">
    <ConsoleHeader title="Settings" />
    
    <div class="content-wrapper animate-stagger">
        
        <!-- API Status Card -->
        <section class="settings-card glass-panel">
            <header class="card-header">
                <div class="header-icon">🔌</div>
                <div class="header-info">
                    <h2 class="card-title">Connection</h2>
                    <p class="card-subtitle">Manage API connectivity</p>
                </div>
                <div class="status-badge" :class="apiStatus">
                    <span class="status-dot"></span>
                    {{ apiStatusText }}
                </div>
            </header>

            <div class="card-body">
                <div class="field-group">
                    <label class="field-label">Current Endpoint</label>
                    <a :href="apiUrl" target="_blank" class="code-block clickable-url" :title="apiUrl">
                        {{ apiUrl }}
                    </a>
                </div>

                <div class="field-group" v-if="pingData">
                    <label class="field-label">Backend Version</label>
                    <div class="version-pill">v{{ pingData.version }}</div>
                </div>
            </div>
            
            <div class="card-actions" v-if="pingData?.spreadsheetUrl">
                 <a :href="pingData.spreadsheetUrl" target="_blank" class="action-btn secondary">
                    <span>Open in Sheets</span>
                    <span>↗</span>
                </a>
            </div>
        </section>

        <!-- Configuration Card -->
        <section class="settings-card glass-panel">
            <header class="card-header">
                <div class="header-icon">⚙️</div>
                <div class="header-info">
                    <h2 class="card-title">Configuration</h2>
                    <p class="card-subtitle">Override default settings</p>
                </div>
            </header>

            <div class="card-body">
                <div class="field-group">
                    <label class="field-label">Custom API URL</label>
                    <div class="input-row">
                        <input 
                            v-model="newApiUrl"
                            type="url" 
                            placeholder="https://script.google.com/..."
                            class="text-input"
                        />
                        <button class="icon-btn" @click="saveApiUrl" title="Save">💾</button>
                    </div>
                    <p class="field-hint">Paste a Web App URL to override the build default.</p>
                </div>

                <div v-if="hasLocalOverride" class="field-group">
                    <button class="text-btn danger" @click="resetApiUrl">Reset to Default</button>
                </div>
            </div>
        </section>
        
        <!-- Modules Card -->
        <section class="settings-card glass-panel" v-if="pingData?.modules">
            <header class="card-header">
                <div class="header-icon">📦</div>
                <div class="header-info">
                    <h2 class="card-title">Modules</h2>
                    <p class="card-subtitle">Installed backend components</p>
                </div>
            </header>

            <div class="modules-grid">
                <div 
                    v-for="(version, name) in pingData.modules" 
                    :key="name"
                    class="module-chip"
                >
                    <span class="mod-name">{{ name }}</span>
                    <span class="mod-ver">v{{ version }}</span>
                </div>
            </div>
        </section>
        
        <!-- About Footer -->
        <footer class="about-footer">
            <div class="app-logo">👑</div>
            <h3 class="footer-title">Clash Manager</h3>
            <p class="footer-ver">v2.0.0 (PWA)</p>
            <p class="footer-desc">
                Advanced Clan Management System<br>
                Built with Vue 3 & Google Apps Script
            </p>
            <a href="https://github.com/albidr/Clash-Manager" target="_blank" class="github-link">
                View on GitHub
            </a>
        </footer>
    </div>
  </div>
</template>

<style scoped>
.view-container { 
    min-height: 100%;
    /* Gradient background handled by global app styles, checking consistency */
}

.content-wrapper {
    max-width: 720px; /* Restored constraint for readability */
    margin: 0 auto;
    padding: 24px 16px 120px;
    display: flex;
    flex-direction: column;
    gap: 24px;
}

/* --- GLASS PANEL --- */
.glass-panel {
    background: var(--sys-surface-glass);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid var(--sys-surface-glass-border);
    border-radius: 24px;
    overflow: hidden;
    box-shadow: var(--sys-elevation-2);
    transition: transform 0.2s, box-shadow 0.2s;
}

/* --- CARD HEADER --- */
.card-header {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 24px;
    background: rgba(255, 255, 255, 0.03);
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}
.header-icon { font-size: 24px; }
.header-info { flex: 1; }
.card-title {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--sys-color-on-surface);
}
.card-subtitle {
    margin: 4px 0 0;
    font-size: 0.85rem;
    color: var(--sys-color-outline);
}

/* --- STATUS BADGE --- */
.status-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 100px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background: var(--sys-color-surface-container);
}
.status-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: currentColor;
}
.status-badge.online { color: var(--sys-color-success); background: rgba(var(--sys-rgb-success), 0.1); }
.status-badge.offline { color: var(--sys-color-error); background: rgba(var(--sys-rgb-error), 0.1); }
.status-badge.checking { color: var(--sys-color-primary); }

/* --- CARD BODY --- */
.card-body { padding: 24px; display: flex; flex-direction: column; gap: 20px; }

.field-group { display: flex; flex-direction: column; gap: 8px; }
.field-label {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    color: var(--sys-color-primary);
    letter-spacing: 0.05em;
}
.field-hint { font-size: 0.8rem; color: var(--sys-color-outline); margin: 0; }

.code-block {
    background: rgba(0, 0, 0, 0.3);
    padding: 12px;
    border-radius: 8px;
    font-family: monospace;
    font-size: 0.8rem;
    color: var(--sys-color-on-surface-variant);
    word-break: break-all;
    border: 1px solid rgba(255, 255, 255, 0.1);
}

.version-pill {
    align-self: flex-start;
    padding: 4px 12px;
    background: var(--sys-color-secondary-container);
    color: var(--sys-color-on-secondary-container);
    border-radius: 6px;
    font-weight: 600;
    font-size: 0.9rem;
}

/* --- ACTIONS --- */
.card-actions {
    padding: 24px;
    background: rgba(var(--sys-rgb-primary), 0.05);
    border-top: 1px solid rgba(255, 255, 255, 0.05);
    text-align: center;
}
.action-btn {
    width: 100%;
    padding: 14px;
    border-radius: 12px;
    font-weight: 700;
    font-size: 1rem;
    cursor: pointer;
    border: none;
    transition: all 0.2s;
    display: flex; justify-content: center; align-items: center; gap: 10px;
}
.action-btn.primary {
    background: var(--sys-color-primary);
    color: var(--sys-color-on-primary);
    box-shadow: 0 4px 12px rgba(var(--sys-rgb-primary), 0.3);
}
.action-btn.secondary {
    background: rgba(255, 255, 255, 0.05);
    color: var(--sys-color-primary);
    text-decoration: none;
    border: 1px solid rgba(255, 255, 255, 0.1);
}
.action-btn.secondary:hover {
    background: rgba(255, 255, 255, 0.1);
}
.clickable-url {
    display: block;
    text-decoration: none;
    cursor: pointer;
    transition: background 0.2s;
}
.clickable-url:hover {
    background: rgba(var(--sys-rgb-primary), 0.1);
    color: var(--sys-color-primary);
}
.action-btn:active { transform: scale(0.98); }
.action-btn:disabled { opacity: 0.7; cursor: wait; }

.action-hint {
    margin: 12px 0 0;
    font-size: 0.8rem;
    color: var(--sys-color-outline);
}

/* --- INPUTS --- */
.input-row { display: flex; gap: 12px; }
.text-input {
    flex: 1;
    background: var(--sys-color-surface-container-high);
    border: 1px solid transparent;
    padding: 10px 16px;
    border-radius: 8px;
    color: var(--sys-color-on-surface);
    font-size: 0.9rem;
}
.text-input:focus { outline: none; border-color: var(--sys-color-primary); }
.icon-btn {
    width: 42px; height: 42px;
    border-radius: 8px;
    background: var(--sys-color-surface-container-highest);
    border: none;
    font-size: 1.2rem;
    cursor: pointer;
}
.text-btn {
    background: none; border: none; font-weight: 600; cursor: pointer; padding: 0;
    align-self: flex-start;
}
.text-btn.danger { color: var(--sys-color-error); }

/* --- MODULES GRID --- */
.modules-grid {
    padding: 24px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 12px;
}
.module-chip {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.05);
    padding: 10px;
    border-radius: 8px;
    display: flex; flex-direction: column; gap: 4px;
}
.mod-name { font-size: 0.7rem; color: var(--sys-color-outline); text-transform: uppercase; }
.mod-ver { font-size: 0.9rem; font-weight: 700; color: var(--sys-color-primary); }

/* --- FOOTER --- */
.about-footer {
    text-align: center;
    margin-top: 24px;
    color: var(--sys-color-outline);
}
.app-logo { font-size: 48px; margin-bottom: 8px; }
.footer-title { margin: 0; font-size: 1.2rem; color: var(--sys-color-on-surface); }
.footer-ver { margin: 4px 0 16px; font-size: 0.8rem; font-family: monospace; opacity: 0.7; }
.footer-desc { margin: 0 0 24px; font-size: 0.9rem; line-height: 1.5; }
.github-link {
    display: inline-block;
    padding: 8px 24px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 100px;
    color: var(--sys-color-primary);
    text-decoration: none;
    font-weight: 600;
    font-size: 0.85rem;
    transition: background 0.2s;
}
.github-link:hover { background: rgba(255, 255, 255, 0.1); }

/* --- ANIMATION --- */
.spinner-sm {
    width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3);
    border-top-color: #fff; border-radius: 50%;
    animation: spin 1s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
