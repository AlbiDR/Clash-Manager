<script setup lang="ts">
import { onMounted, computed, ref } from "vue";
import { useModules } from "../composables/useModules";
import { useTheme } from "../composables/useTheme";
import { useHaptics } from "../composables/useHaptics";
import { useWakeLock } from "../composables/useWakeLock";
import { useSyntheticMode } from "../composables/useSyntheticMode";
import { useBlueprintMode } from "../composables/useBlueprintMode";
import { useShowcaseMode } from "../composables/useShowcaseMode";
import { useClanData } from "../composables/useClanData";
import { useConnectionStatus } from "../composables/useConnectionStatus";
import { idb } from "../utils/idb"; // Fix 23: Import IDB
import ConsoleHeader from "../components/ConsoleHeader.vue";
import SettingsCard from "../components/SettingsCard.vue";
import Icon from "../components/Icon.vue";
import NetworkSettings from "../components/settings/NetworkSettings.vue";
import BackendRefresher from "../components/settings/BackendRefresher.vue";
import NotificationSettings from "../components/settings/NotificationSettings.vue";
import SkeletonSettingsCard from "../components/SkeletonSettingsCard.vue";
import { vTactile } from "../directives/vTactile";

const { modules, toggle } = useModules();
const { theme, setTheme, clearManifestCache } = useTheme();
const haptics = useHaptics();
const wakeLock = useWakeLock();
const { isSyntheticMode, toggleSyntheticMode } = useSyntheticMode();
const { isBlueprintMode, toggleBlueprintMode } = useBlueprintMode();
const { isShowcaseMode, toggleShowcaseMode } = useShowcaseMode();
const { isHydrated, isRefreshing } = useClanData();
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
const showInlineSkeletons = computed(() => isRefreshing.value);

function handleThemeChange(newTheme: any) {
  haptics.tap();
  setTheme(newTheme);
}

// 🔄 SMART UPDATE INTEGRATION
import { useRegisterSW } from "virtual:pwa-register/vue";
const { updateServiceWorker } = useRegisterSW();

async function forceUpdate() {
  haptics.heavy();
  updateServiceWorker(true);
}

async function clearCache() {
  haptics.medium();
  if (
    confirm(
      "Purge Asset Cache?\n\nThis will clear the Service Worker cache and reload the application. Your settings and data will be preserved.",
    )
  ) {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        await registration.unregister();
      }
    }
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((name) => caches.delete(name)));
    clearManifestCache();
    window.location.reload();
  }
}

// Fix 23: Enhanced Factory Reset
async function factoryReset() {
  haptics.heavy();
  if (
    confirm(
      "Reset Application Data?\n\nThis will clear local cache, indexedDB, and settings. Data on the Google Sheet will NOT be affected.",
    )
  ) {
    localStorage.clear();
    sessionStorage.clear();
    try {
      await idb.clear();
    } catch (e) {
      console.warn("IDB clear failed", e);
    }
    window.location.reload();
  }
}
</script>

<template>
  <div class="view-container">
    <ConsoleHeader
      title="Settings"
      :status="apiStatusObject"
      :loading="isRefreshing"
      @refresh="useClanData().refresh()"
    />

    <div class="settings-content gpu-contain">
      <template v-if="showInitialSkeletons">
        <SkeletonSettingsCard v-for="i in 6" :key="i" :index="i" />
      </template>
      <template v-else>
        <!-- TIER 1: Interface & Display -->
        <div class="settings-tier tier-interface">
          <SettingsCard title="Appearance & Utility" icon="gear">
            <div class="theme-switch">
              <button
                class="theme-btn"
                :class="{ active: theme === 'light' }"
                @click="handleThemeChange('light')"
                title="Light Mode"
              >
                <Icon name="theme_light" size="20" />
              </button>
              <button
                class="theme-btn"
                :class="{ active: theme === 'auto' }"
                @click="handleThemeChange('auto')"
                title="Auto / System"
              >
                <Icon name="theme_auto" size="20" />
              </button>
              <button
                class="theme-btn"
                :class="{ active: theme === 'dark' }"
                @click="handleThemeChange('dark')"
                title="Dark Mode"
              >
                <Icon name="moon" size="20" />
              </button>
            </div>

            <div class="features-list" style="margin-top: 24px">
              <div
                v-if="wakeLock.isSupported"
                class="toggle-row"
                :class="{ 'active-row': wakeLock.isActive.value }"
                @click="wakeLock.toggle()"
              >
                <div class="row-info">
                  <div class="row-label">Keep Screen On</div>
                  <div class="row-desc">
                    Prevent display sleep during clan management
                  </div>
                </div>
                <div
                  class="switch"
                  :class="{
                    active: wakeLock.isActive.value,
                    'skeleton-anim sk-badge-s': isRefreshing,
                  }"
                >
                  <div class="handle"></div>
                </div>
              </div>
            </div>
          </SettingsCard>

          <NotificationSettings />
        </div>

        <div class="tier-divider" />

        <!-- TIER 2: Application Features -->
        <div class="settings-tier tier-features">
          <SettingsCard
            title="Application Features"
            icon="analytics"
            :loading="isRefreshing"
          >
            <div class="features-list">
              <div
                class="toggle-row"
                :class="{ 'active-row': modules.ghostBenchmarking }"
                @click="toggle('ghostBenchmarking')"
              >
                <div class="row-info">
                  <div class="row-label">Ghost Benchmarking</div>
                  <div class="row-desc">
                    Visualize clan averages inside stat tooltips
                  </div>
                </div>
                <div
                  class="switch"
                  :class="{
                    active: modules.ghostBenchmarking,
                    'skeleton-anim sk-badge-s': isRefreshing,
                  }"
                >
                  <div class="handle"></div>
                </div>
              </div>

              <div
                class="toggle-row"
                :class="{ 'active-row': modules.sortExplanation }"
                @click="toggle('sortExplanation')"
              >
                <div class="row-info">
                  <div class="row-label">Sorting Descriptions</div>
                  <div class="row-desc">
                    Explain the logic behind sorting heuristics
                  </div>
                </div>
                <div
                  class="switch"
                  :class="{
                    active: modules.sortExplanation,
                    'skeleton-anim sk-badge-s': isRefreshing,
                  }"
                >
                  <div class="handle"></div>
                </div>
              </div>
            </div>
          </SettingsCard>
        </div>

        <div class="tier-divider" />

        <!-- TIER 2.5: Display Preferences -->
        <div class="settings-tier tier-display">
          <SettingsCard
            title="Display Preferences"
            icon="visibility"
            :loading="isRefreshing"
          >
            <div class="features-list">
              <div
                class="toggle-row mini"
                :class="{
                  disabled: isShowcaseMode,
                  'active-row': isSyntheticMode && !isShowcaseMode,
                }"
                @click="!isShowcaseMode && toggleSyntheticMode()"
              >
                <div class="row-info">
                  <div class="row-label">Synthetic Engine</div>
                  <div class="row-desc">
                    Populate the interface with high-fidelity mock data
                  </div>
                </div>
                <div class="switch" :class="{ active: isSyntheticMode }">
                  <div class="handle"></div>
                </div>
              </div>

              <!-- Blueprint Mode -->
              <div
                class="toggle-row mini"
                :class="{
                  disabled: isShowcaseMode,
                  'active-row': isBlueprintMode && !isShowcaseMode,
                }"
                @click="!isShowcaseMode && toggleBlueprintMode()"
              >
                <div class="row-info">
                  <div class="row-label">Structural Blueprint</div>
                  <div class="row-desc">
                    Strip UI to geometric skeletons to audit layout stability
                  </div>
                </div>
                <div class="switch" :class="{ active: isBlueprintMode }">
                  <div class="handle"></div>
                </div>
              </div>

              <div class="mode-connector">
                <div class="connector-line"></div>
                <Icon name="expand" size="14" class="connector-icon" />
              </div>

              <!-- Master Showcase Group -->
              <div
                class="mode-master-container"
                :class="{ active: isShowcaseMode }"
              >
                <div
                  class="toggle-row"
                  :class="{ 'active-row': isShowcaseMode }"
                  @click="toggleShowcaseMode()"
                >
                  <div class="row-info">
                    <div class="row-label flex align-center gap-8">
                      Master Showcase
                      <span v-if="isShowcaseMode" class="hybrid-badge"
                        >HYBRID</span
                      >
                    </div>
                    <div class="row-desc">
                      A curated fusion environment leveraging both synthetic
                      data and structural skeletons
                    </div>
                  </div>
                  <div class="switch" :class="{ active: isShowcaseMode }">
                    <div class="handle"></div>
                  </div>
                </div>
              </div>
            </div>
          </SettingsCard>
        </div>

        <div class="tier-divider" />

        <!-- TIER 3: Infrastructure -->
        <div class="settings-tier tier-infrastructure">
          <NetworkSettings />
          <BackendRefresher v-if="modules.backendRefresher" />
        </div>

        <div class="tier-divider" />

        <!-- TIER 4: System & Recovery (EXPERIMENTAL) -->
        <div class="settings-tier tier-system">
          <SettingsCard title="System & Recovery" icon="gear">
            <template #header-extra>
              <span class="exp-badge">EXPERIMENTAL</span>
            </template>

            <div class="features-list">
              <div
                v-if="modules.blitzMode"
                class="toggle-row"
                :class="{ 'active-row': modules.blitzMode }"
                @click="toggle('blitzMode')"
              >
                <div class="row-info">
                  <div class="row-label flex align-center gap-8">
                    Blitz Mode
                  </div>
                  <div class="row-desc">
                    Batch operations without confirmation (Broken)
                  </div>
                </div>
                <div
                  class="switch"
                  :class="{
                    active: modules.blitzMode,
                    'skeleton-anim sk-badge-s': isRefreshing,
                  }"
                >
                  <div class="handle"></div>
                </div>
              </div>
            </div>

            <div class="card-divider-s" />

            <div class="trouble-grid">
              <button class="trouble-btn" @click="forceUpdate" v-tactile>
                <Icon name="download_done" size="18" />
                <span>Force Update</span>
              </button>

              <button class="trouble-btn" @click="clearCache" v-tactile>
                <Icon name="layers_clear" size="18" />
                <span>Purge Assets</span>
              </button>

              <button
                class="trouble-btn danger"
                @click="factoryReset"
                v-tactile
              >
                <Icon name="restore" size="18" />
                <span>Factory Reset</span>
              </button>
            </div>
          </SettingsCard>
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
          <span v-if="footerBadgeText" class="demo-tag">{{
            footerBadgeText
          }}</span>
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

.tier-danger {
  margin-top: 8px;
}

/* Appearance Styles */
.theme-switch {
  display: flex;
  background: var(--sys-color-surface-container-high);
  padding: 4px;
  border-radius: 99px;
  gap: 4px;
}
.theme-btn {
  flex: 1;
  height: 40px;
  border: none;
  background: transparent;
  color: var(--sys-color-outline);
  border-radius: 99px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s var(--sys-motion-spring);
}
.theme-btn.active {
  background: var(--sys-color-primary);
  color: var(--sys-color-on-primary);
  box-shadow: 0 4px 12px rgba(var(--sys-color-primary-rgb), 0.2);
}

/* Feature Toggle Styles */
.features-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
}
.row-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}
.row-label {
  font-weight: 800;
  font-size: 15px;
  color: var(--sys-color-on-surface);
}
.row-desc {
  font-size: 13px;
  opacity: 0.6;
}

.toggle-row .row-label,
.toggle-row .row-desc {
  color: var(--sys-color-outline);
  opacity: 0.5;
  transition:
    color 0.25s cubic-bezier(0.4, 0, 0.2, 1),
    opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.toggle-row.active-row .row-label {
  color: var(--sys-color-on-surface);
  opacity: 1;
}
.toggle-row.active-row .row-desc {
  color: var(--sys-color-on-surface);
  opacity: 0.8;
}

.exp-badge {
  font-size: 9px;
  font-weight: 900;
  color: var(--sys-color-primary);
  background: var(--sys-color-surface-container-highest);
  padding: 2px 6px;
  border-radius: 4px;
  letter-spacing: 0.05em;
}
.card-divider-s {
  height: 1.5px;
  background: var(--sys-color-outline-variant);
  opacity: 0.1;
  margin: 20px 0;
}
.switch {
  width: 44px;
  height: 24px;
  background: var(--sys-color-surface-container-highest);
  border-radius: 12px;
  position: relative;
  transition: 0.3s;
  border: 1.5px solid rgba(0, 0, 0, 0.1);
}
.switch.active {
  background: var(--sys-color-primary);
}
.switch .handle {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 17px;
  height: 17px;
  background: white;
  border-radius: 50%;
  transition: 0.3s;
}
.switch.active .handle {
  left: calc(100% - 19px);
}

/* System Module Styles */
.module-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 12px;
  overflow: hidden;
}
.module-item {
  background: var(--sys-color-surface-container-high);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.m-name {
  font-size: 10px;
  font-weight: 800;
  opacity: 0.5;
  text-transform: uppercase;
}
.m-ver {
  font-size: 14px;
  font-weight: 700;
  font-family: var(--sys-font-family-mono);
  color: var(--sys-color-primary);
}

.trouble-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.trouble-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  height: 44px;
  background: var(--sys-color-surface-container-high);
  border: none;
  border-radius: 12px;
  color: var(--sys-color-primary);
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.2s;
}
.trouble-btn:active {
  transform: scale(0.98);
  opacity: 0.8;
}
.trouble-btn.danger {
  color: var(--sys-color-error);
}
.trouble-btn i,
.trouble-btn svg {
  opacity: 0.8;
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

.footer-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  opacity: 0.4;
}

.footer-link {
  background: none;
  border: none;
  color: var(--sys-color-primary);
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  cursor: pointer;
  padding: 4px 8px;
}

.footer-link.danger {
  color: var(--sys-color-error);
}

.v-divider-s {
  width: 1px;
  height: 10px;
  background: var(--sys-color-outline-variant);
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

/* Mode Grouping Polish */
.mode-group-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 4px;
}
.mg-label {
  font-size: 10px;
  font-weight: 900;
  color: var(--sys-color-primary);
  opacity: 0.6;
  letter-spacing: 0.08em;
  white-space: nowrap;
}
.mg-line {
  flex: 1;
  height: 1px;
  background: var(--sys-color-outline-variant);
  opacity: 0.15;
}

.toggle-row.mini {
  padding-left: 8px;
  opacity: 1;
  margin-bottom: -4px;
}
.toggle-row.mini .row-label {
  font-size: 14px;
  font-weight: 700;
}
.toggle-row.mini .row-desc {
  font-size: 12px;
}
.toggle-row.mini .switch {
  transform: scale(0.85);
}

.mode-connector {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 8px;
  position: relative;
  margin: -4px 0;
}
.connector-line {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 28px;
  width: 1.5px;
  background: var(--sys-color-outline-variant);
  opacity: 0.1;
}
.connector-icon {
  color: var(--sys-color-outline-variant);
  opacity: 0.3;
  background: var(--sys-color-surface-container);
  z-index: 1;
  padding: 2px;
}

.mode-master-container {
  padding: 8px 12px;
  margin: -8px -2px 0;
  border-radius: 16px;
  background: var(--sys-color-surface-container-highest);
  border: 1px solid transparent;
  transition: all 0.3s var(--sys-motion-spring);
}
.mode-master-container.active {
  background: var(--sys-color-primary-container);
  border-color: rgba(var(--sys-color-primary-rgb), 0.2);
  box-shadow: var(--sys-elevation-1);
}
.mode-master-container.active .toggle-row .row-label {
  color: var(--sys-color-on-primary-container) !important;
}
.mode-master-container.active .toggle-row .row-desc {
  color: var(--sys-color-on-primary-container) !important;
  opacity: 0.7;
}

.hybrid-badge {
  font-size: 9px;
  font-weight: 950;
  background: var(--sys-color-primary);
  color: var(--sys-color-on-primary);
  padding: 2px 6px;
  border-radius: 99px;
  letter-spacing: 0.04em;
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

.copy {
  font-size: 10px;
  opacity: 0.2;
}
</style>
