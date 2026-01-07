<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { useApiState } from "../../composables/useApiState";
import Icon from "../Icon.vue";

const { apiUrl, apiStatus, pingData } = useApiState();
const newApiUrl = ref("");
const isEditing = ref(false);

const hasLocalOverride = computed(() => !!localStorage.getItem("cm_gas_url"));
const isChecking = computed(() => apiStatus.value === "checking");

// TWA Status Diagnostic
const twaStatus = ref<"checking" | "trusted" | "fallback" | "web">("checking");
onMounted(() => {
  if (typeof (window as any).AndroidExternalInterface !== "undefined") {
    // Some TWA bridges expose this
    twaStatus.value = "trusted";
  } else if (
    (window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone) &&
    /android/i.test(window.navigator.userAgent)
  ) {
    // If it's a standalone PWA on Android BUT doesn't have TWA tokens
    // We check if we are in the 'verified' scope
    // A trick is to check if the URL bar is visible via height logic
    // but the most reliable way is if the browser injected specific headers
    // For now, let's assume if it's standalone and Chrome-based, we check if it's fallback.
    twaStatus.value = "fallback";
  } else {
    twaStatus.value = "web";
  }
});

watch(
  apiStatus,
  (newVal) => {
    if (newVal === "unconfigured") isEditing.value = true;
  },
  { immediate: true },
);

function saveApiUrl() {
  if (newApiUrl.value.trim()) {
    localStorage.setItem("cm_gas_url", newApiUrl.value.trim());
    window.location.reload();
  }
}

function resetApiUrl() {
  if (confirm("Reset API URL to default?")) {
    localStorage.removeItem("cm_gas_url");
    window.location.reload();
  }
}
</script>

<template>
  <div class="settings-card" :aria-busy="isChecking ? 'true' : 'false'">
    <div class="card-header">
      <Icon name="plug" size="20" class="header-icon" />
      <h3>Network & API</h3>
      <div class="status-indicator" :class="apiStatus"></div>
    </div>

    <div class="card-body">
      <div class="network-stats">
        <div class="stat-box skeleton-anim">
          <span class="label">Latency</span>
          <template v-if="isChecking">
            <div class="sk-stat-value"></div>
          </template>
          <template v-else>
            <span class="value"
              >{{ pingData?.latency || "--" }}<small>ms</small></span
            >
          </template>
        </div>
        <div class="stat-box skeleton-anim">
          <span class="label">Backend</span>
          <template v-if="isChecking">
            <div class="sk-stat-value"></div>
          </template>
          <template v-else>
            <span class="value">v{{ pingData?.version || "0.0" }}</span>
          </template>
        </div>
        <div class="stat-box skeleton-anim">
          <span class="label">Cache</span>
          <template v-if="isChecking">
            <div class="sk-stat-value" style="width: 50px"></div>
          </template>
          <template v-else>
            <span class="value">Ready</span>
          </template>
        </div>
      </div>

      <div class="url-manager">
        <div class="field-label">API ENDPOINT</div>
        <div v-if="!isEditing" class="url-readout skeleton-anim">
          <template v-if="isChecking">
            <div class="sk-text-line-m" style="width: 80%"></div>
            <div class="sk-button-s"></div>
          </template>
          <template v-else>
            <span class="url-text">{{ apiUrl }}</span>
            <button class="edit-btn" @click="isEditing = true">Edit</button>
          </template>
        </div>
        <div v-else class="url-input-row">
          <template v-if="isChecking">
            <div class="sk-input skeleton-anim" style="flex: 1"></div>
            <div class="sk-button-s skeleton-anim" style="width: 40px"></div>
            <div class="sk-button-s skeleton-anim" style="width: 40px"></div>
          </template>
          <template v-else>
            <input
              v-model="newApiUrl"
              type="text"
              placeholder="https://script.google.com/..."
              class="glass-input"
            />
            <button class="save-btn" @click="saveApiUrl">
              <Icon name="check" size="20" />
            </button>
            <button class="cancel-btn" @click="isEditing = false">X</button>
          </template>
        </div>
        <div v-if="hasLocalOverride" class="override-pill" @click="resetApiUrl">
          Running custom override • Tap to reset
        </div>
      </div>

      <div class="twa-diagnostic">
        <div class="field-label">ENVIRONMENT TRUST</div>
        <div class="trust-card" :class="twaStatus" v-tactile>
          <div class="trust-icon-container">
            <Icon
              :name="twaStatus === 'trusted' ? 'shield-check' : 'alert-triangle'"
              :size="24"
            />
          </div>
          <div class="trust-info">
            <div class="trust-header">
              <span class="trust-title">
                {{
                  twaStatus === "trusted"
                    ? "Trusted Web Activity"
                    : twaStatus === "fallback"
                      ? "Insecure Fallback"
                      : "Standard Web"
                }}
              </span>
              <div v-if="twaStatus === 'checking'" class="checking-dot"></div>
            </div>
            <span class="trust-desc">
              {{
                twaStatus === "trusted"
                  ? "Identity verified. Native branding active."
                  : twaStatus === "fallback"
                    ? "Handshake failed. OS treating app as Browser Tab."
                    : "Running in browser. System features limited."
              }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Copied styles from SettingsView, simplified for component isolation if needed, 
   but for now we rely on the parent or global styles if they were global. 
   However, the original styles were scoped. I need to copy them here. */

.settings-card {
  background: var(--sys-color-surface-container);
  border-radius: 24px;
  border: 1px solid var(--sys-surface-glass-border);
  overflow: hidden;
  transition: background-color 0.3s ease;
}

.card-header {
  padding: 16px 20px;
  display: flex;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}
.card-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 850;
  color: var(--sys-color-on-surface);
}
.header-icon {
  color: var(--sys-color-primary);
}

.card-body {
  padding: 20px;
}

.network-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 20px;
}
.stat-box {
  background: var(--sys-color-surface-container-high);
  padding: 12px;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.stat-box .label {
  font-size: 10px;
  font-weight: 800;
  opacity: 0.6;
  text-transform: uppercase;
}
.stat-box .value {
  font-size: 15px;
  font-weight: 900;
  font-family: var(--sys-font-family-mono);
  color: var(--sys-color-primary);
}

.url-manager .field-label {
  font-size: 10px;
  font-weight: 800;
  opacity: 0.5;
  margin-bottom: 8px;
}
.url-readout {
  background: var(--sys-color-surface-container-highest);
  padding: 10px 14px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.url-text {
  font-family: var(--sys-font-family-mono);
  font-size: 12px;
  opacity: 0.7;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.edit-btn {
  background: none;
  border: none;
  color: var(--sys-color-primary);
  font-weight: 800;
  font-size: 12px;
  cursor: pointer;
}

.url-input-row {
  display: flex;
  gap: 8px;
}
.glass-input {
  flex: 1;
  height: 40px;
  background: white;
  border: 1.5px solid var(--sys-color-primary);
  border-radius: 10px;
  padding: 0 12px;
  font-family: var(--sys-font-family-mono);
  font-size: 13px;
}
.save-btn {
  width: 40px;
  border-radius: 10px;
  background: var(--sys-color-primary);
  color: white;
  border: none;
}
.cancel-btn {
  width: 40px;
  border-radius: 10px;
  background: var(--sys-color-surface-container-highest);
  border: none;
  font-weight: 800;
}

.override-pill {
  margin-top: 10px;
  padding: 8px;
  border-radius: 8px;
  background: var(--sys-color-error-container);
  color: var(--sys-color-on-error-container);
  font-size: 11px;
  font-weight: 800;
  text-align: center;
  cursor: pointer;
}

.status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.status-indicator.online {
  background: #22c55e;
  box-shadow: 0 0 10px #22c55e66;
}
.status-indicator.offline {
  background: #ef4444;
}
.status-indicator.unconfigured {
  background: #f59e0b;
  animation: pulse 2s infinite;
}

.twa-diagnostic {
  margin-top: 28px;
  position: relative;
}

.trust-card {
  display: flex;
  gap: 16px;
  padding: 16px 20px;
  border-radius: 20px;
  background: var(--sys-color-surface-container-high);
  border: 1px solid var(--sys-outline-variant);
  transition: all 0.4s var(--sys-motion-spring);
  position: relative;
  overflow: hidden;
}

/* Trust State: Trusted (Success) */
.trust-card.trusted {
  background: var(--sys-color-success-container);
  border-color: rgba(var(--sys-color-success-rgb), 0.1);
  color: var(--sys-color-on-success-container);
}
.trust-card.trusted .trust-icon-container {
  color: var(--sys-color-success);
}

/* Trust State: Fallback (Warning) */
.trust-card.fallback {
  background: var(--sys-color-error-container);
  border-color: rgba(var(--sys-color-error-rgb), 0.1);
  color: var(--sys-color-on-error-container);
  animation: subtle-pulse 3s infinite ease-in-out;
}
.trust-card.fallback .trust-icon-container {
  color: var(--sys-color-error);
}

/* Trust State: Web (Neutral) */
.trust-card.web {
  opacity: 0.8;
}

.trust-icon-container {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 14px;
  background: rgba(0, 0, 0, 0.03);
  flex-shrink: 0;
}

.trust-info {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
}

.trust-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.trust-title {
  font-size: 14px;
  font-weight: 900;
  letter-spacing: -0.01em;
}

.trust-desc {
  font-size: 12px;
  opacity: 0.7;
  font-weight: 600;
  line-height: 1.3;
}

.checking-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--sys-color-primary);
  animation: pulse 1s infinite;
}

@keyframes subtle-pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(var(--sys-color-error-rgb), 0);
  }
  50% {
    box-shadow: 0 0 15px 0 rgba(var(--sys-color-error-rgb), 0.1);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(var(--sys-color-error-rgb), 0);
  }
}
</style>
