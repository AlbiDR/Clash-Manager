<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
/**
 * COMPONENT: NotificationSettings
 *
 * @remarks
 * Manages background synchronization toggles, heuristic notification threshold
 * options, quiet modes, and push registration workflows for the application.
 */
import { Icon, SettingsCard, vTactile } from "@shared";
import { useSettings } from "../composables/useSettings";
import { computed } from "vue";

defineProps<{
  /** Whether the notification settings card is initially expanded on mount. */
  initiallyExpanded?: boolean;
}>();

const {
  modules,
  toggle,
  notificationPermission,
  isPushSubscribed,
  hasWorker,
  lastSyncFormatted,
  requestNotificationPermission,
  subscribePush,
  sendTestNotification,
  setNotificationThreshold,
} = useSettings();

const threshold = computed(() => modules.notificationThreshold);
</script>

<template>
  <SettingsCard title="Notification Engine" icon="bell" :initially-expanded="initiallyExpanded">
    <div class="notification-stack">
      <button
        v-tactile
        type="button"
        class="notification-toggle master"
        :class="{ active: modules.experimentalNotifications }"
        :aria-pressed="modules.experimentalNotifications"
        @click="toggle('experimentalNotifications')"
      >
        <span class="toggle-copy">
          <span class="toggle-label">Background Sync</span>
          <span class="toggle-meta">{{ modules.experimentalNotifications ? "Active" : "Paused" }}</span>
        </span>
        <span class="toggle-switch" aria-hidden="true">
          <span class="toggle-switch-thumb" />
        </span>
      </button>

      <div class="threshold-row">
        <div class="threshold-copy">
          <div class="row-label">Recruit Alerts</div>
          <div class="row-desc">{{ threshold === 75 ? "High potential" : "Good and higher" }}</div>
        </div>

        <div class="threshold-selector" role="group" aria-label="Notification Threshold">
          <button
            v-tactile
            v-for="thresholdValue in [50, 75] as const"
            :key="thresholdValue"
            :class="{ active: threshold === thresholdValue }"
            @click="setNotificationThreshold(thresholdValue)"
            class="threshold-btn"
            :aria-label="`Set threshold to ${thresholdValue}`"
            :aria-pressed="threshold === thresholdValue"
          >
            <span class="threshold-symbol">≥</span>{{ thresholdValue }}
          </button>
        </div>
      </div>

      <div v-if="notificationPermission === 'default'" class="permission-card">
        <div class="permission-copy">
          <Icon name="bell" size="16" />
          <span>Notifications are off</span>
        </div>
        <button v-tactile class="enable-btn" @click="requestNotificationPermission">
          Enable
        </button>
      </div>

      <div v-if="notificationPermission === 'granted'" class="delivery-panel">
        <button
          v-tactile
          type="button"
          class="notification-toggle"
          :class="{ active: modules.notificationQuietMode }"
          :aria-pressed="modules.notificationQuietMode"
          @click="toggle('notificationQuietMode')"
        >
          <span class="toggle-copy">
            <span class="toggle-label">Quiet Mode</span>
            <span class="toggle-meta">Badge only</span>
          </span>
          <span class="toggle-switch" aria-hidden="true">
            <span class="toggle-switch-thumb" />
          </span>
        </button>

        <button
          v-tactile
          type="button"
          class="notification-toggle"
          :class="{ active: modules.notificationSound }"
          :aria-pressed="modules.notificationSound"
          @click="toggle('notificationSound')"
        >
          <span class="toggle-copy">
            <span class="toggle-label">Sound</span>
            <span class="toggle-meta">System tone</span>
          </span>
          <span class="toggle-switch" aria-hidden="true">
            <span class="toggle-switch-thumb" />
          </span>
        </button>

        <button
          v-if="hasWorker"
          v-tactile
          type="button"
          class="notification-toggle"
          :class="{ active: isPushSubscribed }"
          :aria-pressed="isPushSubscribed"
          @click="subscribePush"
        >
          <span class="toggle-copy">
            <span class="toggle-label">Cloud Push</span>
            <span class="toggle-meta">Worker alerts</span>
          </span>
          <span class="toggle-switch" aria-hidden="true">
            <span class="toggle-switch-thumb" />
          </span>
        </button>
      </div>

      <div v-if="notificationPermission === 'granted'" class="actions-row">
        <button v-tactile class="action-btn" @click="sendTestNotification">
          <Icon name="bell" size="14" />
          <span>Test Alert</span>
        </button>
        <div class="sync-info">Synced {{ lastSyncFormatted }}</div>
      </div>
    </div>
  </SettingsCard>
</template>

<style scoped>
.notification-stack {
  display: flex;
  flex-direction: column;
  gap: var(--sys-space-8);
}

.notification-toggle {
  min-height: 48px;
  width: 100%;
  border: 1px solid rgba(var(--sys-color-outline-rgb), 0.14);
  border-radius: 8px;
  padding: 8px 10px 8px 12px;
  background: var(--sys-color-surface-container-low);
  color: var(--sys-color-on-surface);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sys-space-12);
  text-align: left;
  transition:
    border-color 0.18s ease,
    background 0.18s ease,
    transform 0.18s var(--sys-motion-spring);
}

.notification-toggle.master {
  background: var(--sys-color-surface-container-high);
}

.notification-toggle:hover {
  border-color: rgba(var(--sys-color-primary-rgb), 0.3);
  background: rgba(var(--sys-color-primary-rgb), 0.05);
}

.notification-toggle:active {
  transform: scale(0.99);
}

.notification-toggle.active {
  border-color: rgba(var(--sys-color-primary-rgb), 0.34);
  background: rgba(var(--sys-color-primary-rgb), 0.08);
}

.toggle-copy,
.threshold-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.toggle-label,
.row-label {
  color: var(--sys-color-on-surface);
  font-size: var(--sys-typescale-body-sm);
  font-weight: 800;
  line-height: 1.2;
}

.toggle-meta,
.row-desc {
  color: var(--sys-color-on-surface-variant);
  font-size: var(--sys-typescale-meta);
  font-weight: 650;
  line-height: 1.2;
}

.toggle-switch {
  flex: 0 0 auto;
  width: 42px;
  height: 24px;
  border-radius: 999px;
  padding: 3px;
  background: rgba(var(--sys-color-outline-rgb), 0.24);
  display: flex;
  align-items: center;
  transition: background 0.18s ease;
}

.notification-toggle.active .toggle-switch {
  background: var(--sys-color-primary);
}

.toggle-switch-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--sys-color-surface);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.28);
  transition: transform 0.18s var(--sys-motion-spring);
}

.notification-toggle.active .toggle-switch-thumb {
  transform: translateX(18px);
}

.threshold-row {
  min-height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sys-space-12);
  padding: 8px 10px 8px 12px;
  border: 1px solid rgba(var(--sys-color-outline-rgb), 0.12);
  border-radius: 8px;
  background: var(--sys-color-surface-container-low);
}

.threshold-selector {
  flex: 0 0 auto;
  display: flex;
  background: var(--sys-color-surface-container-high);
  padding: 4px;
  border-radius: 8px;
  gap: 4px;
}

.threshold-btn {
  min-width: 64px;
  height: 40px;
  padding: 0 12px;
  border: none;
  background: transparent;
  color: var(--sys-color-outline);
  border-radius: 6px;
  font-weight: 850;
  font-size: 13px;
  font-family: var(--sys-font-family-mono);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  transition: all 0.18s var(--sys-motion-spring);
}

.threshold-symbol {
  font-size: 15px;
  opacity: 0.7;
}

.threshold-btn.active {
  background: var(--sys-color-primary);
  color: var(--sys-color-on-primary);
  box-shadow: 0 2px 8px rgba(var(--sys-color-primary-rgb), 0.2);
}

.threshold-btn:hover:not(.active) {
  background: rgba(var(--sys-color-primary-rgb), 0.08);
  color: var(--sys-color-on-surface);
}

.threshold-btn:active {
  transform: scale(0.96);
}

.permission-card {
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sys-space-12);
  padding: 8px 8px 8px 12px;
  border: 1px solid rgba(var(--sys-color-primary-rgb), 0.16);
  border-radius: 8px;
  background: rgba(var(--sys-color-primary-rgb), 0.06);
}

.permission-copy {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--sys-space-8);
  color: var(--sys-color-on-surface);
  font-size: var(--sys-typescale-body-sm);
  font-weight: 750;
}

.enable-btn {
  min-width: 82px;
  height: 40px;
  background: var(--sys-color-primary);
  color: var(--sys-color-on-primary);
  border: none;
  border-radius: 6px;
  font-weight: 800;
  font-size: var(--sys-typescale-body-sm);
  cursor: pointer;
  transition: transform 0.18s var(--sys-motion-spring);
}

.enable-btn:active {
  transform: scale(0.96);
}

.delivery-panel {
  display: flex;
  flex-direction: column;
  gap: var(--sys-space-8);
}

.actions-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sys-space-12);
  padding-top: var(--sys-space-4);
}

.action-btn {
  height: 40px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid rgba(var(--sys-color-outline-rgb), 0.16);
  background: var(--sys-color-surface-container-low);
  color: var(--sys-color-on-surface);
  font-size: var(--sys-typescale-meta);
  font-weight: 800;
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.sync-info {
  min-width: 0;
  color: var(--sys-color-on-surface-variant);
  font-size: var(--sys-typescale-meta);
  font-family: var(--sys-font-family-mono);
  opacity: 0.7;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 390px) {
  .threshold-row,
  .actions-row {
    align-items: stretch;
    flex-direction: column;
  }

  .threshold-selector,
  .action-btn {
    width: 100%;
  }

  .threshold-btn {
    flex: 1;
  }
}
</style>
