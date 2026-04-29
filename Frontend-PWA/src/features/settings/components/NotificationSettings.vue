<script setup lang="ts">
import { Icon, SettingRow } from "@shared";
import { useSettings } from "../composables/useSettings";
import { computed } from "vue";
import SettingsCard from "./SettingsCard.vue";

const props = defineProps<{
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
    <!-- Master Toggle -->
    <SettingRow
      label="Background Synchronization"
      description="Allow the application to refresh and alert in the background"
      :active="modules.experimentalNotifications"
      @click="toggle('experimentalNotifications')"
    />

    <div class="card-divider-s" style="margin: 16px 0" />

    <!-- Threshold Selector Section -->
    <div class="notification-section">
      <div class="section-header">
        <div class="row-label">Heuristic Threshold</div>
        <div class="row-desc">Sync alerts for recruits with score</div>
      </div>

      <div
        class="threshold-selector"
        role="group"
        aria-label="Notification Threshold"
      >
        <button
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

    <!-- Improvement #13: Permission Rationale & Grant -->
    <div v-if="notificationPermission === 'default'" class="perm-section">
      <div class="perm-rationale">
        <Icon name="bell" size="16" />
        <span
          >Enable notifications to get updates on high-potential recruits even
          when the app is closed.</span
        >
      </div>
      <button class="enable-btn" @click="requestNotificationPermission">
        Enable Notifications & Badges
      </button>
    </div>

    <!-- Toggles Section -->
    <div class="toggles-grid" v-if="notificationPermission === 'granted'">
      <!-- Improvement #5: Quiet Mode -->
      <SettingRow
        label="Quiet Mode"
        description="Update badge without sound or popups"
        :active="modules.notificationQuietMode"
        @click="toggle('notificationQuietMode')"
      />

      <!-- Improvement #11: Sound Control -->
      <SettingRow
        label="Sound"
        description="Play system sound on sync"
        :active="modules.notificationSound"
        @click="toggle('notificationSound')"
      />

      <!-- FEATURE 1: Cloud Push -->
      <SettingRow
        v-if="hasWorker"
        label="Cloud Push"
        description="Receive alerts instantly via Worker"
        :active="isPushSubscribed"
        @click="subscribePush"
      />
    </div>

    <!-- Actions Row -->
    <div class="actions-row" v-if="notificationPermission === 'granted'">
      <!-- Improvement #9: Test Notification -->
      <button class="action-btn" @click="sendTestNotification">
        <Icon name="bell" size="14" />
        <span>Test Alert</span>
      </button>
      <div class="sync-info">Last synced: {{ lastSyncFormatted }}</div>
    </div>

    <div class="badge-preview">
      <Icon name="info" size="14" />
      <span>{{
        threshold === 75
          ? "Focus on high-potential talent only"
          : "Show all good recruits"
      }}</span>
    </div>
  </SettingsCard>
</template>

<style scoped>
.notification-section {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.perm-section {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.perm-rationale {
  display: flex;
  gap: 12px;
  font-size: 13px;
  line-height: 1.4;
  color: var(--sys-color-on-surface-variant);
  background: var(--sys-color-surface-container);
  padding: 12px;
  border-radius: 8px;
  align-items: center;
}

.enable-btn {
  width: 100%;
  height: 40px;
  background: var(--sys-color-primary);
  color: var(--sys-color-on-primary);
  border: none;
  border-radius: 12px;
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
  transition: 0.2s var(--sys-motion-standard);
}

/* Toggles Grid */
.toggles-grid {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 16px;
  border-top: 1px solid rgba(128, 128, 128, 0.1);
}


/* Actions Row */
.actions-row {
  margin-top: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 16px;
  border-top: 1px solid rgba(128, 128, 128, 0.1);
}

.action-btn {
  height: 32px;
  padding: 0 16px;
  border-radius: 99px;
  border: 1px solid var(--sys-color-outline-variant);
  background: transparent;
  color: var(--sys-color-on-surface);
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.sync-info {
  font-size: 11px;
  opacity: 0.5;
  font-family: var(--sys-font-family-mono);
}

.section-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}


/* Elegant threshold selector matching Console Header pill style */
.threshold-selector {
  display: flex;
  background: var(--sys-color-surface-container-high);
  padding: 4px;
  border-radius: 99px;
  gap: 4px;
  width: fit-content;
}

.threshold-btn {
  flex: 1;
  min-width: 80px;
  height: 40px;
  padding: 0 18px;
  border: none;
  background: transparent;
  color: var(--sys-color-outline);
  border-radius: 99px;
  font-weight: 800;
  font-size: 14px;
  font-family: var(--sys-font-family-mono);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  transition: all 0.2s var(--sys-motion-spring);
}

.threshold-symbol {
  font-size: 16px;
  opacity: 0.7;
}

.threshold-btn.active {
  background: var(--sys-color-primary);
  color: var(--sys-color-on-primary);
  box-shadow: 0 4px 12px rgba(var(--sys-color-primary-rgb), 0.25);
  transform: scale(1.02);
}

.threshold-btn.active .threshold-symbol {
  opacity: 1;
}

.threshold-btn:hover:not(.active) {
  background: rgba(var(--sys-color-primary-rgb), 0.08);
  color: var(--sys-color-on-surface);
}

.threshold-btn:active {
  transform: scale(0.96);
}

.badge-preview {
  margin-top: 16px;
  padding: 12px;
  background: rgba(var(--sys-color-primary-rgb), 0.08); /* Fixed opacity */
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  font-weight: 600;
  color: var(--sys-color-on-surface);
  /* opacity: 0.8; Removed to improve contrast */
}

.card-divider-s {
  height: 1.5px;
  background: var(--sys-color-outline-variant);
  opacity: 0.1;
  margin: 20px 0;
}
</style>
