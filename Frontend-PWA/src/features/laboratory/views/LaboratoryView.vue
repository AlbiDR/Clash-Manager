<script setup lang="ts">
import {
  vTactile,
  Icon,
  ConsoleLayout
} from "@shared";
import { useClashDataStore, useBlueprintMode, useHaptics } from "@core";
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useLaboratory } from "../composables/useLaboratory";

// Laboratory Components
import VaultCard from "../components/VaultCard.vue";
import ParameterCard from "../components/ParameterCard.vue";
import SummaryCard from "../components/SummaryCard.vue";
import TrajectoryItem from "../components/TrajectoryItem.vue";
import LaboratorySkeleton from "../components/LaboratorySkeleton.vue";

const {
  observation,
  operation,
  settings,
  isFetching,
  isSimulating,
  fetchError,
  setSettings,
  handleVaultUpdate,
  refresh,
} = useLaboratory();

const { isBlueprintMode } = useBlueprintMode();
const haptics = useHaptics();

const showSkeletons = computed(() => isFetching.value || isBlueprintMode.value);
const appVersion = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0";

const clashDataStore = useClashDataStore();
const { data: globalData } = storeToRefs(clashDataStore);

const statusText = computed(() => {
  if (isFetching.value) return "Scanning Vault...";
  if (isSimulating.value) return "Computing Trajectory...";
  if (fetchError.value) return "Extraction Failed";
  if (!globalData.value?.playerTag) return "Target Required";
  return "Engine Operational";
});

const statusType = computed(() => {
  if (isFetching.value || isSimulating.value) return "loading";
  if (fetchError.value) return "error";
  return "ready";
});

const isEmpty = computed(() => !observation.value && !isFetching.value);

</script>

<template>
  <ConsoleLayout
    title="Laboratory"
    :status="{ type: statusType, text: statusText }"
    :loading="showSkeletons"
    :is-empty="isEmpty"
    :empty-message="!globalData?.playerTag ? 'Target Required' : 'No results found'"
    :empty-hint="!globalData?.playerTag ? 'No PlayerTag configured in Project Properties.' : 'Ensure your inventory is correctly entered in The Vault.'"
    empty-icon="flask"
    :skeleton-component="LaboratorySkeleton"
    :skeleton-count="1"
    :sync-error="fetchError || undefined"
    @refresh="refresh"
  >
    <template #empty-action>
      <router-link v-if="!globalData?.playerTag" to="/settings" class="btn-primary">
        <Icon name="settings" size="18" />
        <span>Configure Settings</span>
      </router-link>
    </template>

    <!-- Simulation Dashboard -->
    <div v-if="observation" class="dashboard-grid">
      <!-- 1. The Vault & Settings -->
      <div class="dashboard-sidebar">
        <VaultCard 
          :inventory="observation.inventory"
          :is-simulating="isSimulating"
          @update="handleVaultUpdate"
        />
        
        <ParameterCard 
          :settings="settings"
          :current-level="observation.profile.kingLevel"
          @update="setSettings"
        />
      </div>

      <!-- 2. Result Summary -->
      <SummaryCard 
        v-if="operation"
        :result="operation"
        :profile="observation.profile"
      />

      <!-- 3. Trajectory (Upgrade List) -->
      <div v-if="operation && operation.actions.length > 0" class="trajectory-section">
        <h3 class="section-title">
          <Icon name="trend_up" size="18" />
          <span>Recommended Trajectory</span>
        </h3>
        <div class="trajectory-list">
          <TrajectoryItem 
            v-for="(upgrade, index) in operation.actions" 
            :key="`${upgrade.cardName}-${index}`"
            :upgrade="upgrade"
            :index="index"
          />
        </div>
      </div>
    </div>

    <!-- Brand Alignment Footer -->
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
        <span v-if="isBlueprintMode" class="demo-tag">BLUEPRINT</span>
      </div>
      <div class="copy">Copyright © 2026 AlbiDR</div>
    </div>
  </ConsoleLayout>
</template>

<style scoped>
.dashboard-grid {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 0 4px;
}

.dashboard-sidebar {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}

@media (min-width: 640px) {
  .dashboard-sidebar {
    grid-template-columns: 1fr 1fr;
  }
}

.section-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 18px;
  font-weight: 900;
  margin: 12px 0;
  padding: 0 8px;
}

.trajectory-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
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
