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
import { Icon, SettingRow, SettingsCard, vTactile } from "@shared";
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
  <SettingsCard
    title="Notification Engine"
    icon="bell"
    :initially-expanded="initiallyExpanded"
  >
    <div class="notification-stack">
      <!-- [DECISION LOG] NAMED FOR WHAT IT DOES:
           This was labelled "Background Sync", which describes neither the flag
           it sets nor the effect. It toggles `experimentalNotifications`, the
           single gate useHeadhunter checks before raising a recruit alert
           (useHeadhunter.ts:175), and nothing about it syncs anything. The
           description now states the consequence rather than repeating the
           switch position back at the reader, which the switch already shows. -->
      <SettingRow
        label="Recruit Alerts"
        :description="modules.experimentalNotifications
          ? 'Alert me when a recruit clears the threshold below'
          : 'No alerts are raised for new recruits'"
        :active="modules.experimentalNotifications"
        mini
        @click="toggle('experimentalNotifications')"
      />

      <div class="threshold-row">
        <div class="threshold-copy">
          <!-- Named for the band it sets. The master switch above is now
               "Recruit Alerts", and two stacked rows carrying one name is
               worse than the label this replaces. -->
          <div class="row-label">
            Alert Threshold
          </div>
          <div class="row-desc">
            {{ modules.experimentalNotifications
              ? (threshold === 75 ? "High potential only" : "Good and higher")
              : "Applies once Recruit Alerts are on" }}
          </div>
        </div>

        <div
          class="threshold-selector"
          role="group"
          aria-label="Notification Threshold"
        >
          <button
            v-for="thresholdValue in [50, 75] as const"
            :key="thresholdValue"
            v-tactile
            :class="{ active: threshold === thresholdValue }"
            class="threshold-btn"
            :aria-label="`Set threshold to ${thresholdValue}`"
            :aria-pressed="threshold === thresholdValue"
            @click="setNotificationThreshold(thresholdValue)"
          >
            <span class="threshold-symbol">≥</span>{{ thresholdValue }}
          </button>
        </div>
      </div>

      <div
        v-if="notificationPermission === 'default'"
        class="permission-card"
      >
        <div class="permission-copy">
          <Icon
            name="bell"
            size="16"
          />
          <span>Notifications are off</span>
        </div>
        <button
          v-tactile
          class="enable-btn"
          @click="requestNotificationPermission"
        >
          Enable
        </button>
      </div>

      <div
        v-if="notificationPermission === 'granted'"
        class="delivery-panel"
      >
        <SettingRow
          label="Quiet Mode"
          description="Badge only"
          :active="modules.notificationQuietMode"
          mini
          @click="toggle('notificationQuietMode')"
        />

        <SettingRow
          label="Sound"
          description="System tone"
          :active="modules.notificationSound"
          mini
          @click="toggle('notificationSound')"
        />

        <!-- [DECISION LOG] A SWITCH THAT CANNOT SWITCH IS DISABLED, NOT LIVE:
             `subscribePush` is a stub (useSettings.ts) that raises a "coming
             soon" toast and subscribes to nothing, while this row rendered as a
             working toggle. Offering a control that silently declines is worse
             than showing it greyed with the reason, so it now says why. Restore
             the handler and this row together once the Edge Function exists. -->
        <SettingRow
          v-if="hasWorker"
          label="Cloud Push"
          description="Unavailable: server push is not deployed yet"
          :active="isPushSubscribed"
          :disabled="true"
          mini
          @click="subscribePush"
        />

        <SettingRow
          label="Badge high potential only"
          :description="modules.notificationBadgeHighPotential
            ? 'App badge counts recruits at or above the threshold'
            : 'App badge counts every new recruit'"
          :active="modules.notificationBadgeHighPotential"
          mini
          @click="toggle('notificationBadgeHighPotential')"
        />
      </div>

      <div
        v-if="notificationPermission === 'granted'"
        class="actions-row"
      >
        <button
          v-tactile
          class="action-btn"
          @click="sendTestNotification"
        >
          <Icon
            name="bell"
            size="14"
          />
          <span>Test Alert</span>
        </button>
        <div class="sync-info">
          Synced {{ lastSyncFormatted }}
        </div>
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

.threshold-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* Row typescale is aligned to the SettingRow/LinkRow scale (body-rg over body-sm).
   This card previously rendered the same semantic roles a step smaller (body-sm over
   meta), which is what made the Settings stack read as inconsistent between cards.
   Colour treatment stays local: these rows are static labels, not toggle rows, so they
   do not adopt SettingRow's muted-until-active palette. */
.row-label {
  color: var(--sys-color-on-surface);
  font-size: var(--sys-typescale-body-rg);
  font-weight: 800;
  line-height: 1.2;
}

.row-desc {
  color: var(--sys-color-on-surface-variant);
  font-size: var(--sys-typescale-body-sm);
  line-height: 1.2;
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
  height: var(--sys-space-48); /* 48px Mobile Footprint (Target B.2) */
  padding: 0 12px;
  border: none;
  background: transparent;
  color: var(--sys-color-outline);
  border-radius: 6px;
  font-weight: 700;
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
  height: var(--sys-space-48); /* 48px Mobile Footprint (Target B.2) */
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
  height: var(--sys-space-48); /* 48px Mobile Footprint (Target B.2) */
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
