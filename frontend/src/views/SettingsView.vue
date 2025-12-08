<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { isConfigured, getApiUrl, ping } from '../api/gasClient'
import type { PingResponse } from '../types'

const apiUrl = ref('')
const apiConfigured = ref(false)
const apiStatus = ref<'checking' | 'online' | 'offline'>('checking')
const pingData = ref<PingResponse | null>(null)
const newApiUrl = ref('')

onMounted(async () => {
  apiUrl.value = getApiUrl()
  apiConfigured.value = isConfigured()
  
  if (apiConfigured.value) {
    try {
      const response = await ping()
      if (response.status === 'success' && response.data) {
        apiStatus.value = 'online'
        pingData.value = response.data
      } else {
        apiStatus.value = 'offline'
      }
    } catch {
      apiStatus.value = 'offline'
    }
  }
})

function saveApiUrl() {
  if (newApiUrl.value.trim()) {
    // In a real app, you'd save this to localStorage
    alert(`To configure the API URL, add this to your .env file:\n\nVITE_GAS_URL=${newApiUrl.value}\n\nThen restart the dev server.`)
  }
}
</script>

<template>
  <div class="settings-view">
    <h1 class="page-title">Settings</h1>
    
    <!-- API Configuration -->
    <section class="settings-section glass-card animate-fade-in">
      <h2 class="section-title">🔌 API Configuration</h2>
      
      <div class="setting-item">
        <label class="setting-label">Status</label>
        <div class="status-display">
          <span 
            class="status-indicator"
            :class="{
              'status-online': apiStatus === 'online',
              'status-offline': apiStatus === 'offline',
              'status-checking': apiStatus === 'checking'
            }"
          ></span>
          <span class="status-text">
            {{ apiStatus === 'online' ? 'Connected' : apiStatus === 'offline' ? 'Disconnected' : 'Checking...' }}
          </span>
        </div>
      </div>
      
      <div class="setting-item">
        <label class="setting-label">Endpoint</label>
        <code class="api-url">{{ apiUrl }}</code>
      </div>
      
      <div class="setting-item" v-if="pingData">
        <label class="setting-label">Backend Version</label>
        <span class="setting-value">{{ pingData.version }}</span>
      </div>
      
      <!-- API URL Input (for unconfigured state) -->
      <div class="setting-item" v-if="!apiConfigured">
        <label class="setting-label">Configure API URL</label>
        <div class="url-input-group">
          <input 
            v-model="newApiUrl"
            type="url" 
            placeholder="https://script.google.com/macros/s/.../exec"
            class="url-input"
          />
          <button class="btn btn-primary" @click="saveApiUrl">Save</button>
        </div>
        <p class="setting-hint">
          Deploy your GAS backend and paste the Web App URL here.
        </p>
      </div>
    </section>
    
    <!-- Module Versions -->
    <section class="settings-section glass-card animate-fade-in" style="animation-delay: 0.1s" v-if="pingData?.modules">
      <h2 class="section-title">📦 Backend Modules</h2>
      
      <div class="modules-grid">
        <div 
          v-for="(version, name) in pingData.modules" 
          :key="name"
          class="module-item"
        >
          <span class="module-name">{{ name }}</span>
          <span class="module-version">v{{ version }}</span>
        </div>
      </div>
    </section>
    
    <!-- App Info -->
    <section class="settings-section glass-card animate-fade-in" style="animation-delay: 0.2s">
      <h2 class="section-title">ℹ️ About</h2>
      
      <div class="about-content">
        <div class="app-logo">👑</div>
        <h3 class="app-name">Clash Royale Manager</h3>
        <p class="app-version">PWA v1.0.0</p>
        <p class="app-description">
          A modern Progressive Web App for managing your Clash Royale clan.
          Built with Vue 3, TypeScript, and Vite.
        </p>
        
        <div class="about-links">
          <a href="https://github.com" target="_blank" class="about-link">
            GitHub →
          </a>
        </div>
      </div>
          <div class="thumb"></div>
        </button>
      </div>
    </div>

    <div class="section-title">About</div>
    <div class="neo-card">
      <div class="about-row">
        <span>Version</span>
        <span class="version-tag">{{ version }}</span>
      </div>
      <div class="about-row">
        <span>Build</span>
        <span>Stable (PWA)</span>
      </div>
    </div>
    
    <div class="footer-note">
      Clash Manager &copy; 2025
    </div>
  </div>
</template>

<style scoped>
.settings-view {
  padding: 24px 16px 120px 16px;
  max-width: 600px;
  margin: 0 auto;
}

.section-title {
}

/* Setting Items */
.setting-item {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.setting-item:last-child {
  margin-bottom: 0;
}

.setting-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--cr-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.setting-value {
  color: var(--cr-text-primary);
}

.setting-hint {
  font-size: 0.8125rem;
  color: var(--cr-text-muted);
  margin: 0.5rem 0 0;
}

/* Status Display */
.status-display {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.status-indicator {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.status-online {
  background: var(--cr-victory);
  box-shadow: 0 0 8px var(--cr-victory);
}

.status-offline {
  background: var(--cr-defeat);
}

.status-checking {
  background: var(--cr-gold);
  animation: pulse-glow 1s infinite;
}

.status-text {
  font-weight: 500;
}

/* API URL */
.api-url {
  font-size: 0.75rem;
  padding: 0.5rem 0.75rem;
  background: var(--cr-bg-tertiary);
  border-radius: 0.5rem;
  word-break: break-all;
  color: var(--cr-text-secondary);
}

/* URL Input */
.url-input-group {
  display: flex;
  gap: 0.5rem;
}

.url-input {
  flex: 1;
  padding: 0.75rem;
  background: var(--cr-bg-tertiary);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.5rem;
  color: var(--cr-text-primary);
  font-size: 0.875rem;
}

.url-input:focus {
  outline: none;
  border-color: var(--cr-primary);
}

/* Modules Grid */
.modules-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 0.5rem;
}

.module-item {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  background: var(--cr-bg-tertiary);
  border-radius: 0.5rem;
  font-size: 0.75rem;
}

.module-name {
  color: var(--cr-text-secondary);
}

.module-version {
  color: var(--cr-primary-light);
  font-weight: 600;
}

/* About Section */
.about-content {
  text-align: center;
}

.app-logo {
  font-size: 3rem;
  margin-bottom: 0.5rem;
}

.app-name {
  font-size: 1.25rem;
  margin: 0 0 0.25rem;
}

.app-version {
  font-size: 0.875rem;
  color: var(--cr-text-muted);
  margin: 0 0 1rem;
}

.app-description {
  font-size: 0.875rem;
  color: var(--cr-text-secondary);
  margin: 0 0 1rem;
  line-height: 1.5;
}

.about-links {
  display: flex;
  justify-content: center;
  gap: 1rem;
}

.about-link {
  color: var(--cr-primary-light);
  text-decoration: none;
  font-weight: 600;
  font-size: 0.875rem;
}

.about-link:hover {
  text-decoration: underline;
}
</style>
