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
  apkChangelog,
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
      <button class="trouble-btn" @click="forceUpdate" v-tactile>
        <Icon name="refresh" size="24" />
        <span>Refresh App</span>
      </button>

      <button class="trouble-btn" @click="clearCache" v-tactile>
        <Icon name="layers_clear" size="24" />
        <span>Purge Assets</span>
      </button>

      <button v-if="isNativeWrapper" class="trouble-btn" @click="checkApkUpdate" v-tactile>
        <Icon name="search" size="24" />
        <span>Check APK</span>
      </button>

      <button v-if="isNativeWrapper" class="trouble-btn" @click="downloadApk" v-tactile>
        <Icon name="download" size="24" />
        <span>Download Update</span>
      </button>

      <button v-else-if="shouldShowPwaInstall" class="trouble-btn" @click="installPwa" v-tactile>
        <Icon name="box" size="24" />
        <span>Install PWA</span>
      </button>

      <button class="trouble-btn danger" @click="factoryReset" v-tactile>
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
        <span>
          <strong>Installed</strong>
          {{ installedApkLabel }}
        </span>
        <span>
          <strong>Published</strong>
          {{ latestApkLabel }}
        </span>
      </div>
      <p class="apk-artifact">{{ apkArtifactLabel }}</p>
      <p v-if="shouldShowApkFeedSource" class="apk-feed-source">{{ apkFeedSourceLabel }}</p>
      <ul v-if="apkChangelog.length" class="apk-changelog">
        <li v-for="entry in apkChangelog.slice(0, 3)" :key="entry">{{ entry }}</li>
      </ul>
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
  gap: 12px;
}
.trouble-grid.has-extra {
  grid-template-columns: repeat(5, 1fr);
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
  border-radius: 16px;
  color: var(--sys-color-primary);
  font-size: 11px;
  font-weight: 800;
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
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 14px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--sys-color-outline-variant) 70%, transparent);
  border-radius: 10px;
  background: var(--sys-color-surface-container);
}

.apk-status-row {
  display: grid;
  grid-template-columns: 8px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
}

.apk-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--sys-color-outline);
}

.apk-diagnostics[data-state="available"] .apk-status-dot {
  background: var(--sys-color-primary);
}

.apk-diagnostics[data-state="current"] .apk-status-dot {
  background: var(--sys-color-success);
}

.apk-diagnostics[data-state="blocked"],
.apk-diagnostics[data-state="mismatch"],
.apk-diagnostics[data-state="error"] {
  border-color: color-mix(in srgb, var(--sys-color-error) 45%, var(--sys-color-outline-variant));
}

.apk-diagnostics[data-state="blocked"] .apk-status-dot,
.apk-diagnostics[data-state="mismatch"] .apk-status-dot,
.apk-diagnostics[data-state="error"] .apk-status-dot {
  background: var(--sys-color-error);
}

.apk-status-text {
  min-width: 0;
  font-size: 12px;
  font-weight: 800;
  color: var(--sys-color-on-surface);
}

.apk-status-time,
.apk-artifact {
  font-size: 11px;
  color: var(--sys-color-on-surface-variant);
}

.apk-version-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.apk-version-grid span {
  display: flex;
  flex-direction: column;
  min-width: 0;
  font-size: 12px;
  color: var(--sys-color-on-surface);
}

.apk-version-grid strong {
  font-size: 10px;
  color: var(--sys-color-on-surface-variant);
  text-transform: uppercase;
}

.apk-artifact,
.apk-feed-source {
  margin: 0;
}

.apk-feed-source {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10px;
  color: var(--sys-color-error);
}

.apk-changelog {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding-left: 16px;
  font-size: 12px;
  color: var(--sys-color-on-surface);
}

.flex {
  display: flex;
}
.align-center {
  align-items: center;
}
.gap-8 {
  gap: 8px;
}
</style>
