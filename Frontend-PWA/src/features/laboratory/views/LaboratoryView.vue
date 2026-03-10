<script setup lang="ts">
import {
  Icon,
  ConsoleLayout
} from "@shared";
import { useClashDataStore } from "@core";
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
    :loading="isFetching"
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
</style>
