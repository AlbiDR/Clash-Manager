<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useApiState } from '../composables/useApiState'

// Local state for the input field
const newApiUrl = ref('') 

// Use the centralized composable for all API-related reactive data
const { 
    apiUrl, 
    apiConfigured, 
    apiStatus, 
    pingData, 
    checkApiStatus 
} = useApiState()

onMounted(() => {
    checkApiStatus()
})

function saveApiUrl() {
    if (newApiUrl.value.trim()) {
        alert(`To configure the API URL, add this to your .env file:\n\nVITE_GAS_URL=${newApiUrl.value}\n\nThen restart the dev server.`)
    }
}
</script>

<template>
  <div class="settings-view">
    <h1 class="page-title">Settings</h1>
    
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
    </section>
    
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
  font-size: 1.25rem;
  font-weight: 700;
  margin-bottom: 1rem;
  color: var(--sys-color-on-surface);
}

.glass-card {
  background: var(--sys-surface-glass);
  backdrop-filter: var(--sys-surface-glass-blur);
  -webkit-backdrop-filter: var(--sys-surface-glass-blur);
  border: 1px solid var(--sys-surface-glass-border);
  border-radius: var(--shape-corner-l);
  padding: 20px;
  margin-bottom: 16px;
  box-shadow: var(--sys-elevation-1);
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
  color: var(--sys-color-outline);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.setting-value {
  color: var(--sys-color-on-surface);
  font-family: var(--sys-typescale-mono);
}

.setting-hint {
  font-size: 0.8125rem;
  color: var(--sys-color-outline);
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
  transition: all 0.3s;
}

.status-online {
  background: var(--sys-color-success);
  box-shadow: 0 0 8px var(--sys-color-success);
}

.status-offline {
  background: var(--sys-color-error);
}

.status-checking {
  background: var(--sys-color-primary);
  animation: pulse-glow 1s infinite;
}

.status-text {
  font-weight: 500;
}

/* API URL */
.api-url {
  font-size: 0.75rem;
  padding: 0.5rem 0.75rem;
  background: var(--sys-color-surface-container-high);
  border-radius: 0.5rem;
  word-break: break-all;
  color: var(--sys-color-on-surface-variant);
  font-family: var(--sys-typescale-mono);
}

/* URL Input */
.url-input-group {
  display: flex;
  gap: 0.5rem;
}

.url-input {
  flex: 1;
  padding: 0.75rem;
  background: var(--sys-color-surface-container-high);
  border: 1px solid transparent;
  border-radius: 0.5rem;
  color: var(--sys-color-on-surface);
  font-size: 0.875rem;
}

.url-input:focus {
  outline: none;
  border-color: var(--sys-color-primary);
  background: var(--sys-color-surface);
}

.btn {
  padding: 0 16px;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  border: none;
}

.btn-primary {
  background: var(--sys-color-primary);
  color: var(--sys-color-on-primary);
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
  background: var(--sys-color-surface-container-high);
  border-radius: 0.5rem;
  font-size: 0.75rem;
}

.module-name {
  color: var(--sys-color-on-surface-variant);
}

.module-version {
  color: var(--sys-color-primary);
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
  font-weight: 700;
  margin: 0 0 0.25rem;
  color: var(--sys-color-on-surface);
}

.app-version {
  font-size: 0.875rem;
  color: var(--sys-color-outline);
  margin: 0 0 1rem;
}

.app-description {
  font-size: 0.875rem;
  color: var(--sys-color-on-surface-variant);
  margin: 0 0 1rem;
  line-height: 1.5;
}

.about-links {
  display: flex;
  justify-content: center;
  gap: 1rem;
}

.about-link {
  color: var(--sys-color-primary);
  text-decoration: none;
  font-weight: 600;
  font-size: 0.875rem;
}

.about-link:hover {
  text-decoration: underline;
}

.footer-note {
  text-align: center;
  font-size: 0.75rem;
  color: var(--sys-color-outline);
  margin-top: 2rem;
}

@keyframes pulse-glow {
  0% { opacity: 1; }
  50% { opacity: 0.5; }
  100% { opacity: 1; }
}
</style>
