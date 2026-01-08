<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useApiState } from "../../composables/useApiState";
import SettingsCard from "../SettingsCard.vue";
import Icon from "../Icon.vue";

const { apiUrl, apiStatus, pingData } = useApiState();
const newApiUrl = ref("");
const isEditing = ref(false);

const hasLocalOverride = computed(() => !!localStorage.getItem("cm_gas_url"));
const isChecking = computed(() => apiStatus.value === "checking");

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
  <SettingsCard title="Network & API" icon="plug" :loading="isChecking">
    <template #header-extra>
      <div class="status-indicator" :class="apiStatus"></div>
    </template>

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
      <div class="field-label">API Endpoint</div>
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
  </SettingsCard>
</template>

<style scoped>
.network-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 24px;
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

.field-label {
  font-size: 11px;
  font-weight: 900;
  opacity: 0.5;
  margin-bottom: 10px;
  font-family: var(--sys-font-family-body);
  letter-spacing: 0.02em;
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
</style>
