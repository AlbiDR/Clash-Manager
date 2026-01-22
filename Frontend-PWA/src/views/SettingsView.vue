<script setup lang="ts">
import { computed } from "vue";
import { useAppSettings } from "../composables/useAppSettings";
import { useHaptics } from "../composables/useHaptics";
import { useSyntheticMode } from "../composables/useSyntheticMode";
import { useBlueprintMode } from "../composables/useBlueprintMode";
import { useShowcaseMode } from "../composables/useShowcaseMode";
import { useClashData } from "../composables/useClashData";
import { useConnectionStatus } from "../composables/useConnectionStatus";
import ConsoleHeader from "../components/ConsoleHeader.vue";
import NetworkSettings from "../components/settings/NetworkSettings.vue";
import BackendRefresher from "../components/settings/BackendRefresher.vue";
import NotificationSettings from "../components/settings/NotificationSettings.vue";
import AppearanceSettings from "../components/settings/AppearanceSettings.vue";
import FeatureSettings from "../components/settings/FeatureSettings.vue";
import DisplayModeSettings from "../components/settings/DisplayModeSettings.vue";
import SystemRecovery from "../components/settings/SystemRecovery.vue";
import SkeletonSettingsCard from "../components/SkeletonSettingsCard.vue";
import { vTactile } from "../directives/vTactile";

const { modules } = useAppSettings();
const haptics = useHaptics();
const { isSyntheticMode } = useSyntheticMode();
const { isBlueprintMode } = useBlueprintMode();
const { isShowcaseMode } = useShowcaseMode();
const { isHydrated, isRefreshing } = useClashData();
const appVersion =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0";

const { status: unifiedStatus } = useConnectionStatus();

const footerBadgeText = computed(() => {
  if (isShowcaseMode.value) return "SHOWCASE";
  if (isBlueprintMode.value) return "BLUEPRINT";
  if (isSyntheticMode.value) return "SYNTHETIC";
  return "";
});

const apiStatusObject = computed(() => {
  if (unifiedStatus.value === "online")
    return { type: "ready", text: "Systems Online" } as const;
  if (unifiedStatus.value === "offline")
    return { type: "error", text: "Disconnected" } as const;
  if (unifiedStatus.value === "syncing")
    return { type: "loading", text: "Syncing..." } as const;
  if (unifiedStatus.value === "success-resolve")
    return { type: "ready", text: "Verified" } as const;

  return { type: "loading", text: "Connecting..." } as const;
});

const showInitialSkeletons = computed(() => !isHydrated.value);
</script>

<template>
  <div class="view-container">
    <ConsoleHeader
      title="Settings"
      :status="apiStatusObject"
      :loading="isRefreshing"
      @refresh="useClashData().refresh()"
    />

    <div class="settings-content gpu-contain">
      <template v-if="showInitialSkeletons">
        <SkeletonSettingsCard v-for="i in 6" :key="i" :index="i" />
      </template>
      <template v-else>
        <!-- TIER 1: Interface & Display -->
        <div class="settings-tier tier-interface">
          <AppearanceSettings :loading="isRefreshing" />
          <NotificationSettings />
        </div>

        <div class="tier-divider" />

        <!-- TIER 2: Application Features -->
        <div class="settings-tier tier-features">
          <FeatureSettings :loading="isRefreshing" />
        </div>

        <div class="tier-divider" />

        <!-- TIER 2.5: Display Preferences -->
        <div class="settings-tier tier-display">
          <DisplayModeSettings :loading="isRefreshing" />
        </div>

        <div class="tier-divider" />

        <!-- TIER 3: Infrastructure -->
        <div class="settings-tier tier-infrastructure">
          <NetworkSettings />
          <BackendRefresher v-if="modules.backendRefresher" />
        </div>

        <div class="tier-divider" />

        <!-- TIER 4: System & Recovery -->
        <div class="settings-tier tier-system">
          <SystemRecovery :loading="isRefreshing" />
        </div>
      </template>

      <div class="footer-info">
        <div
          class="brand"
          @click="
            haptics.heavy();
            window.location.reload();
          "
          v-tactile
        >
          CLASH MANAGER V{{ appVersion }}
          <span v-if="footerBadgeText" class="demo-tag">{{ footerBadgeText }}</span>
        </div>
        <div class="copy">Copyright © 2026 AlbiDR</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.view-container {
  min-height: 100vh;
}

.settings-content {
  padding: 12px 0 120px;
  display: flex;
  flex-direction: column;
}

.settings-tier {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.tier-divider {
  height: 32px;
}

.footer-info {
  padding: 40px 0;
  text-align: center;
  user-select: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.brand {
  font-size: 12px;
  font-weight: 950;
  opacity: 0.3;
  letter-spacing: 0.1em;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  transition: opacity 0.2s;
}
.brand:active {
  opacity: 0.6;
}

.demo-tag {
  background: var(--sys-color-primary);
  color: var(--sys-color-on-primary);
  font-size: 8px;
  padding: 2px 6px;
  border-radius: 4px;
  letter-spacing: 0;
  opacity: 1;
}

.copy {
  font-size: 10px;
  opacity: 0.2;
}
</style>
