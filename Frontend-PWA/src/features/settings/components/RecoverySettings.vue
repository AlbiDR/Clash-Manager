<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import { Icon, vTactile, SettingsCard } from "@shared";
import { useSettings } from "../composables/useSettings";
import { useNativeBridge } from "@core/services/useNativeBridge";
import { computed, onMounted } from "vue";

defineProps<{
  initiallyExpanded?: boolean;
}>();

const {
  forceUpdate,
  checkApkUpdate,
  downloadApk,
  apkUpdateState,
  apkUpdateMessage,
  apkUpdateLastCheckedAt,
  installedApkLabel,
  latestApkLabel,
  apkArtifactLabel,
  apkFeedSourceLabel,
  installPwa,
  isPwaStandalone,
  clearCache,
  factoryReset,
} = useSettings();

const { isNativeWrapper } = useNativeBridge();
const shouldShowPwaInstall = computed(() => !isNativeWrapper.value && !isPwaStandalone.value);
const apkCheckedAtLabel = computed(() => {
  if (!apkUpdateLastCheckedAt.value) return "Not checked";
  return new Date(apkUpdateLastCheckedAt.value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
});
const shouldShowApkFeedSource = computed(() => apkUpdateState.value === "mismatch" && apkFeedSourceLabel.value.length > 0);

onMounted(() => {
  if (isNativeWrapper.value) void checkApkUpdate();
});
</script>

<template>
  <SettingsCard title="System & Recovery" icon="gear" :initially-expanded="initiallyExpanded">
    <template #header-extra>
      <span class="exp-badge">EXPERIMENTAL</span>
    </template>

    <div class="trouble-grid" :class="{ 'has-extra': isNativeWrapper || shouldShowPwaInstall }">
      <button type="button" class="trouble-btn" @click.stop.prevent="forceUpdate" v-tactile>
        <Icon name="refresh" size="24" />
        <span>Refresh App</span>
      </button>

      <button type="button" class="trouble-btn" @click.stop.prevent="clearCache" v-tactile>
        <Icon name="layers_clear" size="24" />
        <span>Purge Assets</span>
      </button>

      <button v-if="isNativeWrapper" type="button" class="trouble-btn" @click.stop.prevent="downloadApk" v-tactile>
        <Icon name="download" size="24" />
        <span>Download Update</span>
      </button>

      <button v-else-if="shouldShowPwaInstall" type="button" class="trouble-btn" @click.stop.prevent="installPwa" v-tactile>
        <Icon name="box" size="24" />
        <span>Install PWA</span>
      </button>

      <button type="button" class="trouble-btn danger" @click.stop.prevent="factoryReset" v-tactile>
        <Icon name="restore" size="24" />
        <span>Factory Reset</span>
      </button>
    </div>

    <div v-if="isNativeWrapper" class="apk-diagnostics" :data-state="apkUpdateState">
      <div class="apk-status-row">
        <span class="apk-status-dot" />
        <span class="apk-status-text">{{ apkUpdateMessage }}</span>
        <span class="apk-status-time">{{ apkCheckedAtLabel }}</span>
      </div>
      <div class="apk-version-grid">
        <div class="apk-version-cell">
          <span class="apk-version-label">Installed</span>
          <strong class="apk-version-value">{{ installedApkLabel }}</strong>
        </div>
        <div class="apk-version-cell">
          <span class="apk-version-label">Published</span>
          <strong class="apk-version-value">{{ latestApkLabel }}</strong>
        </div>
      </div>
      <div class="apk-meta-row">
        <span class="apk-artifact">{{ apkArtifactLabel }}</span>
      </div>
      <p v-if="shouldShowApkFeedSource" class="apk-feed-source">{{ apkFeedSourceLabel }}</p>
    </div>
  </SettingsCard>
</template>

<style scoped>
.exp-badge {
  font-size: 9px;
  font-weight: 900;
  color: var(--sys-color-primary);
  background: var(--sys-color-surface-container-highest);
  padding: 2px 6px;
  border-radius: 4px;
  letter-spacing: 0.05em;
}

.trouble-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--sys-space-8);
}
.trouble-grid.has-extra {
  grid-template-columns: repeat(4, 1fr);
}
.trouble-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 84px;
  padding: 8px 4px;
  background: var(--sys-color-surface-container-high);
  border: none;
  border-radius: 8px;
  color: var(--sys-color-primary);
  font-size: 11px;
  font-weight: 800;
  text-decoration: none;
  text-align: center;
  line-height: 1.2;
  cursor: pointer;
  transition: transform 0.2s cubic-bezier(0.2, 0, 0, 1), opacity 0.2s, background-color 0.2s;
}
.trouble-btn:active {
  transform: scale(0.92);
  opacity: 0.85;
  background: var(--sys-color-surface-container-highest);
}
.trouble-btn.danger {
  color: var(--sys-color-error);
}

.apk-diagnostics {
  --apk-state-color: var(--sys-color-outline);
  --apk-state-container: var(--sys-color-surface-container-high);
  --apk-state-on-container: var(--sys-color-on-surface);
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
  padding: 10px;
  border: 1px solid color-mix(in srgb, var(--apk-state-color) 18%, var(--sys-color-outline-variant));
  border-radius: var(--sys-shape-corner-small);
  background: color-mix(in srgb, var(--sys-color-surface-container) 82%, transparent);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.apk-status-row {
  display: grid;
  grid-template-columns: 6px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  min-height: 22px;
}

.apk-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--apk-state-color);
}

.apk-diagnostics[data-state="checking"],
.apk-diagnostics[data-state="available"] {
  --apk-state-color: var(--sys-color-primary);
  --apk-state-container: color-mix(in srgb, var(--sys-color-primary) 14%, var(--sys-color-surface-container-high));
  --apk-state-on-container: var(--sys-color-primary);
}

.apk-diagnostics[data-state="current"] {
  --apk-state-color: var(--sys-color-success);
  --apk-state-container: color-mix(in srgb, var(--sys-color-success) 15%, var(--sys-color-surface-container-high));
  --apk-state-on-container: var(--sys-color-success);
}

.apk-diagnostics[data-state="blocked"] {
  --apk-state-color: var(--sys-color-warning);
  --apk-state-container: color-mix(in srgb, var(--sys-color-warning) 16%, var(--sys-color-surface-container-high));
  --apk-state-on-container: var(--sys-color-warning);
}

.apk-diagnostics[data-state="mismatch"],
.apk-diagnostics[data-state="error"] {
  --apk-state-color: var(--sys-color-error);
  --apk-state-container: var(--sys-color-error-container);
  --apk-state-on-container: var(--sys-color-on-error-container);
}

.apk-status-text {
  min-width: 0;
  overflow: hidden;
  font-size: var(--sys-typescale-meta);
  font-weight: 850;
  color: var(--sys-color-on-surface);
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.apk-status-time {
  justify-self: end;
  min-width: max-content;
  padding: 2px 6px;
  border-radius: var(--sys-shape-corner-full);
  background: var(--apk-state-container);
  color: var(--apk-state-on-container);
  font-family: var(--sys-font-family-mono);
  font-size: var(--sys-typescale-label-sm);
  font-weight: 850;
}

.apk-version-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.apk-version-cell {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  min-width: 0;
  color: var(--sys-color-on-surface);
}

.apk-version-label {
  font-size: var(--sys-typescale-label-sm);
  font-weight: 900;
  color: var(--sys-color-on-surface-variant);
  text-transform: uppercase;
  line-height: 1;
}

.apk-version-value {
  min-width: 0;
  overflow: hidden;
  color: var(--sys-color-on-surface);
  font-size: var(--sys-typescale-meta);
  font-weight: 850;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.apk-meta-row {
  display: flex;
  min-width: 0;
}

.apk-artifact {
  min-width: 0;
  overflow: hidden;
  color: var(--sys-color-on-surface-variant);
  font-family: var(--sys-font-family-mono);
  font-size: var(--sys-typescale-label-sm);
  font-weight: 750;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.apk-feed-source {
  margin: 0;
  overflow: hidden;
  padding: 4px 6px;
  border-radius: var(--sys-shape-corner-badge);
  background: color-mix(in srgb, var(--sys-color-error) 10%, transparent);
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--sys-typescale-label-sm);
  font-weight: 750;
  color: var(--sys-color-error);
}

@media (max-width: 430px) {
  .apk-diagnostics {
    gap: 7px;
    padding: 9px;
  }

  .apk-version-grid {
    gap: 8px;
  }
}
</style>
