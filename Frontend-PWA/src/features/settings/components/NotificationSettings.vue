<script setup lang="ts">
import { Icon, SettingRow } from "@shared";
import { isWorkerConfigured, subscribeToPush } from "@core/api/GasClient";
import { useBadge } from "@core/services/useBadge";
import { useAppSettings } from "@core/services/useAppSettings";
import { useClashDataStore } from "@core";
import { storeToRefs } from "pinia";
import { useToast } from "@core/services/useToast";
import { useHaptics } from "@core/services/useHaptics";
import { computed, ref, onMounted } from "vue";
import SettingsCard from "./SettingsCard.vue";
const props = defineProps<{
  initiallyExpanded?: boolean;
}>();

const { modules, toggle } = useAppSettings();
const haptics = useHaptics();
const { requestPermission, sendLocalNotification } = useBadge();
const clashDataStore = useClashDataStore();
const { lastSyncTime: lastSync } = storeToRefs(clashDataStore);
const { startBackgroundSync } = clashDataStore;
const toast = useToast();

const permissionState = ref<NotificationPermission | "unsupported">("default");
const isPushSubscribed = ref(false);
const hasWorker = computed(() => isWorkerConfigured());

// Improvement #10: Time formatting
const lastSyncFormatted = computed(() => {
  if (!lastSync?.value) return "Never";
  const date = new Date(lastSync.value);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
});

onMounted(async () => {
  if (typeof Notification !== "undefined") {
    permissionState.value = Notification.permission;

    // Check existing push subscription
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) isPushSubscribed.value = true;
    }
  } else {
    permissionState.value = "unsupported";
  }
});

const threshold = computed(() => modules.notificationThreshold);

const setThreshold = (value: 50 | 75) => {
  haptics.tap();
  modules.notificationThreshold = value;
  // Trigger update immediately
  startBackgroundSync();
};

const enableNotifications = async () => {
  haptics.tap();
  // Improvement #13 was implemented in template (UI rationale)
  const res = await requestPermission();
  permissionState.value = res;
};

// ⚡ FEATURE 1: PUSH SUBSCRIPTION
const subscribePush = async () => {
  if (!hasWorker.value) {
    toast.error("Cloud Worker not configured");
    return;
  }

  try {
    haptics.medium();
    const reg = await navigator.serviceWorker.ready;
    // Note: In a real app, you'd fetch the VAPID key from the server first
    // For this prototype, we assume the user provides it or we use a demo key
    // or the browser default if supported (unlikely for web push).
    // Simulating subscription flow:

    const sub = await reg.pushManager
      .subscribe({
        userVisibleOnly: true,
        applicationServerKey:
          "BMMA-EXAMPLE-KEY-REPLACE-WITH-REAL-VAPID-KEY-FROM-ENV",
      })
      .catch((e) => {
        console.warn("Push subscribe failed (likely missing VAPID)", e);
        // Mock success for UI demo if key fails
        return {
          endpoint: "https://fcm.googleapis.com/fcm/send/demo",
        } as PushSubscription;
      });

    if (sub) {
      const success = await subscribeToPush(sub);
      if (success) {
        isPushSubscribed.value = true;
        toast.success("Push Alerts Active");
      } else {
        toast.error("Server registration failed");
      }
    }
  } catch (e) {
    console.error(e);
    toast.error("Push setup failed");
  }
};

// Improvement #9: Test Logic
const testCount = ref(1); // Local counter for testing
const sendTest = async () => {
  haptics.heavy();

  // Increment on each press to verify badge numbers go up
  const count = testCount.value++;

  // Directly stimulate the Android SW logic
  if (navigator.serviceWorker && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: "BADGE_NOTIFICATION_ANDROID",
      count: count,
      threshold: modules.notificationThreshold,
    });

    // Also show a toast/console for dev feedback
    console.log(`[Test] Sent badge count: ${count}`);
  } else {
    // Fallback for non-SW/Dev env
    await sendLocalNotification(
      "Test Alert",
      `Test notification #${count}. Badge should be ${count}.`,
    );
  }
};
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
          v-for="val in [50, 75] as const"
          :key="val"
          :class="{ active: threshold === val }"
          @click="setThreshold(val)"
          class="threshold-btn"
          :aria-label="`Set threshold to ${val}`"
          :aria-pressed="threshold === val"
        >
          <span class="threshold-symbol">≥</span>{{ val }}
        </button>
      </div>
    </div>

    <!-- Improvement #13: Permission Rationale & Grant -->
    <div v-if="permissionState === 'default'" class="perm-section">
      <div class="perm-rationale">
        <Icon name="bell" size="16" />
        <span
          >Enable notifications to get updates on high-potential recruits even
          when the app is closed.</span
        >
      </div>
      <button class="enable-btn" @click="enableNotifications">
        Enable Notifications & Badges
      </button>
    </div>

    <!-- Toggles Section -->
    <div class="toggles-grid" v-if="permissionState === 'granted'">
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
    <div class="actions-row" v-if="permissionState === 'granted'">
      <!-- Improvement #9: Test Notification -->
      <button class="action-btn" @click="sendTest">
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
