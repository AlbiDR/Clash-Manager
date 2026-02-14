<script setup lang="ts">
import { vTactile } from "../../../shared/directives/vTactile";
import ConsoleLayout from "../../../shared/ui/ConsoleLayout.vue";
import HeaderInfoOverlay from "../../../shared/ui/HeaderInfoOverlay.vue";
import ConsoleHeader from "../../../shared/ui/ConsoleHeader.vue";
import FloatingDock from "../../../shared/ui/FloatingDock.vue";
import { computed } from "vue";
import { useSettings } from "../composables/useSettings";
import NetworkSettings from "../components/NetworkSettings.vue";
import BackendRefresher from "../components/BackendRefresher.vue";
import NotificationSettings from "../components/NotificationSettings.vue";
import AppearanceSettings from "../components/AppearanceSettings.vue";
import FeatureSettings from "../components/FeatureSettings.vue";
import ModeSettings from "../components/ModeSettings.vue";
import RecoverySettings from "../components/RecoverySettings.vue";


const {
  apiStatusObject,
  isRefreshing,
  isHydrated,
  refresh,
  appVersion,
  footerBadgeText,
  modules,
  haptics,
} = useSettings();

const showInitialSkeletons = computed(() => !isHydrated.value);
</script>

<template>
  <div class="view-container">
    <ConsoleHeader
      title="Settings"
      :status="apiStatusObject"
      :loading="isRefreshing"
      sheet-url="https://script.google.com/u/0/home/projects/1Filr0HnIaN3dJENeZ7KtU4enHaCNH1LqcztujRwFQ7_RTZVJ7VY5K9zH"
      @refresh="refresh()"
    />

    <div class="settings-content gpu-contain">
      <template v-if="showInitialSkeletons">
        <SkeletonSettingsCard v-for="i in 6" :key="i" :index="i" />
      </template>
      <template v-else>
        <!-- TIER 1: Interface & Display -->
        <div class="settings-tier tier-interface">
          <AppearanceSettings :initially-expanded="true" />
          <NotificationSettings />
        </div>

        <div class="tier-divider" />

        <!-- TIER 2: Application Features -->
        <div class="settings-tier tier-features">
          <FeatureSettings :initially-expanded="true" />
        </div>

        <div class="tier-divider" />

        <!-- TIER 2.5: Display Preferences -->
        <div class="settings-tier tier-display">
          <ModeSettings />
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
          <RecoverySettings />
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
  padding: 0 0 120px;
  display: flex;
  flex-direction: column;
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
