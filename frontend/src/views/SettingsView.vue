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

// Editor Link Logic
const editorUrl = computed(() => {
    if (pingData.value?.scriptId) {
        return `https://script.google.com/home/projects/${pingData.value.scriptId}/edit`
    }
    return undefined
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
                    
                    <!-- Clickable Link to Editor -->
                    <a v-if="editorUrl" 
                       :href="editorUrl" 
                       target="_blank" 
                       class="code-block clickable-url" 
                       title="Open GAS Editor"
                    >
                        {{ apiUrl }}
                        <span class="link-hint">↗</span>
                    </a>

                    <!-- Fallback: Read-only -->
                    <div v-else class="code-block" :title="apiUrl">
                        {{ apiUrl }}
                    </div>
                </div>

                <div class="field-group" v-if="pingData">
                    <label class="field-label">Backend Version</label>
                    <div class="version-pill">v{{ pingData.version }}</div>
                </div>
            </div>
            
            <!-- Removed redundant 'Open in Sheets' button here as requested -->
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
}

.content-wrapper {
    max-width: var(--sys-layout-max-width);
    margin: 0 auto;
    padding: var(--spacing-l) var(--spacing-m) 120px;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-l);
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
    transition: transform 0.2s, box-shadow 0.2s;
}

/* --- CARD HEADER --- */
.card-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-m);
    padding: var(--spacing-l);
    background: rgba(255, 255, 255, 0.03);
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}
.header-icon { font-size: 24px; }
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
}

/* --- STATUS BADGE --- */
.status-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: var(--shape-corner-full);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-bold);
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
.card-body { padding: var(--spacing-l); display: flex; flex-direction: column; gap: 20px; }

.field-group { display: flex; flex-direction: column; gap: var(--spacing-xs); }

.field-label {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-heavy);
    text-transform: uppercase;
    color: var(--sys-color-primary);
    letter-spacing: 0.05em;
}
.field-hint { font-size: var(--font-size-s); color: var(--sys-color-outline); margin: 0; }

.code-block {
    background: rgba(0, 0, 0, 0.3);
    padding: var(--spacing-s);
    border-radius: var(--shape-corner-s);
    font-family: var(--sys-typescale-mono);
    font-size: var(--font-size-s);
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
    font-weight: var(--font-weight-bold);
    font-size: var(--font-size-s);
}

/* --- ACTIONS --- */
.clickable-url {
    display: block;
    text-decoration: none;
    cursor: pointer;
    transition: background 0.2s;
    position: relative;
    padding-right: 32px; /* Space for hint */
}
.clickable-url:hover {
    background: rgba(var(--sys-color-primary-rgb), 0.1);
    color: var(--sys-color-primary);
}
.link-hint {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    opacity: 0.5;
    font-size: 14px;
}
.clickable-url:hover .link-hint { opacity: 1; }

.action-hint {
    margin: 12px 0 0;
    font-size: 0.8rem;
    color: var(--sys-color-outline);
}

/* --- INPUTS --- */
.input-row { display: flex; gap: var(--spacing-s); }
.text-input {
    flex: 1;
    background: var(--sys-color-surface-container-high);
    border: 1px solid transparent;
    padding: 10px 16px;
    border-radius: var(--shape-corner-s);
    color: var(--sys-color-on-surface);
    font-size: var(--font-size-m);
}
.text-input:focus { outline: none; border-color: var(--sys-color-primary); }
.icon-btn {
    width: 42px; height: 42px;
    border-radius: var(--shape-corner-s);
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
    padding: var(--spacing-l);
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: var(--spacing-s);
}
.module-chip {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.05);
    padding: 10px;
    border-radius: var(--shape-corner-s);
    display: flex; flex-direction: column; gap: 4px;
}
.mod-name { font-size: var(--font-size-xs); color: var(--sys-color-outline); text-transform: uppercase; }
.mod-ver { font-size: var(--font-size-s); font-weight: var(--font-weight-heavy); color: var(--sys-color-primary); }

/* --- FOOTER --- */
.about-footer {
    text-align: center;
    margin-top: var(--spacing-l);
    color: var(--sys-color-outline);
}
.app-logo { font-size: 48px; margin-bottom: 8px; }
.footer-title { margin: 0; font-size: 1.2rem; color: var(--sys-color-on-surface); }
.footer-ver { margin: 4px 0 16px; font-size: 0.8rem; font-family: var(--sys-typescale-mono); opacity: 0.7; }
.footer-desc { margin: 0 0 24px; font-size: 0.9rem; line-height: 1.5; }
.github-link {
    display: inline-block;
    padding: 8px 24px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: var(--shape-corner-full);
    color: var(--sys-color-primary);
    text-decoration: none;
    font-weight: 600;
    font-size: 0.85rem;
    transition: background 0.2s;
}
.github-link:hover { background: rgba(255, 255, 255, 0.1); }
</style>
