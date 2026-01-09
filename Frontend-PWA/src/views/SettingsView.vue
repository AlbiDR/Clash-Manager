<script setup lang="ts">
import { onMounted, computed, ref } from "vue";
import { useModules } from "../composables/useModules";
import { useTheme } from "../composables/useTheme";
import { useHaptics } from "../composables/useHaptics";
import { useWakeLock } from "../composables/useWakeLock";
import { useDemoMode } from "../composables/useDemoMode";
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
const { theme, setTheme } = useTheme();
const haptics = useHaptics();
const wakeLock = useWakeLock();
const { isDemoMode, toggleDemoMode } = useDemoMode();
const { isHydrated, isRefreshing } = useClanData();
const appVersion = __APP_VERSION__;

const { status: unifiedStatus } = useConnectionStatus();

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

const showSkeletons = computed(() => !isHydrated.value || isRefreshing.value);

function handleThemeChange(newTheme: any) {
  haptics.tap();
  setTheme(newTheme);
}

// Fix 23: Enhanced Factory Reset
async function factoryReset() {
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
      :loading="showSkeletons"
      @refresh="useClanData().refresh()"
    />

    <div class="settings-content gpu-contain">
      <template v-if="showSkeletons">
        <SkeletonSettingsCard v-for="i in 6" :key="i" :index="i" />
      </template>
      <template v-else>
        <!-- TIER 1: Core User Settings -->
        <div class="settings-tier tier-core">
          <SettingsCard title="Appearance" icon="gear">
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
          </SettingsCard>

          <NotificationSettings />
        </div>

        <div class="tier-divider" />

        <!-- TIER 2: Feature Toggles -->
        <div class="settings-tier tier-features">
          <SettingsCard title="Extra Features" icon="lightning" :loading="isRefreshing">
            <div class="features-list">
              <div class="toggle-row" @click="toggle('ghostBenchmarking')">
                <div class="row-info">
                  <template v-if="isRefreshing">
                    <div class="sk-text-line-m" style="width: 140px"></div>
                    <div class="sk-text-line-s" style="width: 200px"></div>
                  </template>
                  <template v-else>
                    <div class="row-label">Ghost Benchmarking</div>
                    <div class="row-desc">Visualize clan averages inside stat tooltips</div>
                  </template>
                </div>
                <div class="switch" :class="{ active: modules.ghostBenchmarking, 'skeleton-anim sk-badge-s': isRefreshing }">
                  <div class="handle"></div>
                </div>
              </div>

              <div class="toggle-row" @click="toggle('sortExplanation')">
                <div class="row-info">
                  <template v-if="isRefreshing">
                    <div class="sk-text-line-m" style="width: 150px"></div>
                    <div class="sk-text-line-s" style="width: 180px"></div>
                  </template>
                  <template v-else>
                    <div class="row-label">Sorting Descriptions</div>
                    <div class="row-desc">Explain the logic behind sorting heuristics</div>
                  </template>
                </div>
                <div class="switch" :class="{ active: modules.sortExplanation, 'skeleton-anim sk-badge-s': isRefreshing }">
                  <div class="handle"></div>
                </div>
              </div>

              <div class="toggle-row" @click="toggleDemoMode">
                <div class="row-info">
                  <template v-if="isRefreshing">
                    <div class="sk-text-line-m" style="width: 160px"></div>
                    <div class="sk-text-line-s" style="width: 220px"></div>
                  </template>
                  <template v-else>
                    <div class="row-label">Portfolio Demo Mode</div>
                    <div class="row-desc">Use mock data engine for technical showcase</div>
                  </template>
                </div>
                <div class="switch" :class="{ active: isDemoMode, 'skeleton-anim sk-badge-s': isRefreshing }">
                  <div class="handle"></div>
                </div>
              </div>

              <div v-if="wakeLock.isSupported" class="toggle-row" @click="wakeLock.toggle()">
                <div class="row-info">
                  <template v-if="isRefreshing">
                    <div class="sk-text-line-m" style="width: 100px"></div>
                    <div class="sk-text-line-s" style="width: 180px"></div>
                  </template>
                  <template v-else>
                    <div class="row-label">Keep Screen On</div>
                    <div class="row-desc">Prevent display sleep during clan management</div>
                  </template>
                </div>
                <div class="switch" :class="{ active: wakeLock.isActive.value, 'skeleton-anim sk-badge-s': isRefreshing }">
                  <div class="handle"></div>
                </div>
              </div>
            </div>
          </SettingsCard>

          <SettingsCard title="Experiments" icon="flask" :loading="isRefreshing">
            <div class="features-list">
              <div class="toggle-row" @click="toggle('blitzMode')">
                <div class="row-info">
                  <template v-if="isRefreshing">
                    <div class="sk-text-line-m" style="width: 140px"></div>
                    <div class="sk-text-line-s" style="width: 200px"></div>
                  </template>
                  <template v-else>
                    <div class="row-label">Blitz Mode</div>
                    <div class="row-desc">Batch operations without confirmation dialogs</div>
                  </template>
                </div>
                <div class="switch" :class="{ active: modules.blitzMode, 'skeleton-anim sk-badge-s': isRefreshing }">
                  <div class="handle"></div>
                </div>
              </div>
            </div>
          </SettingsCard>
        </div>

        <div class="tier-divider" />

        <!-- TIER 3: System & Advanced -->
        <div class="settings-tier tier-system">
          <NetworkSettings />
          
          <!-- System Modules Removed -->

          <BackendRefresher v-if="modules.backendRefresher" />
        </div>

        <div class="tier-divider" />

        <!-- TIER 4: Danger Zone -->
        <div class="settings-tier tier-danger">
          <SettingsCard title="Troubleshooting" icon="undo">
            <p class="trouble-text">If data sync is inconsistent, a local reset will re-initialize the app cache.</p>
            <button class="reset-btn" @click="factoryReset">Reset Application Data</button>
          </SettingsCard>
        </div>
      </template>

      <div class="footer-info" v-tactile>
        <div class="brand">
          CLASH MANAGER V{{ appVersion }}
          <span v-if="isDemoMode" class="demo-tag">DEMO</span>
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

/* Recovery Styles */
.trouble-text {
  font-size: 13px;
  opacity: 0.6;
  line-height: 1.5;
  margin-bottom: 16px;
}
.reset-btn {
  width: 100%;
  height: 44px;
  border-radius: 12px;
  background: var(--sys-color-surface-container-highest);
  border: 1.5px solid rgba(0, 0, 0, 0.05);
  font-weight: 800;
  font-size: 14px;
  color: var(--sys-color-on-surface);
  cursor: pointer;
}

.footer-info {
  padding: 40px 0;
  text-align: center;
  cursor: pointer;
  user-select: none;
}
.brand {
  font-size: 12px;
  font-weight: 900;
  opacity: 0.2;
  letter-spacing: 0.1em;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
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
  margin-top: 4px;
}
</style>
