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
import {
  VaultCard,
  ParameterCard,
  SummaryCard,
  TrajectoryList,
  LaboratorySkeleton
} from "../components";

const {
  observation,
  operation,
  isSimulating,
  settings,
  layoutProps,
  setSettings,
  handleVaultUpdate,
  refresh,
  getTrajectoryMemoKeys,
} = useLaboratory();

const clashDataStore = useClashDataStore();
const { data: globalData } = storeToRefs(clashDataStore);

</script>

<template>
  <ConsoleLayout
    title="Laboratory"
    v-bind="layoutProps"
    :empty-message="!globalData?.playerTag ? 'Target Required' : 'No results found'"
    :empty-hint="!globalData?.playerTag ? 'No PlayerTag configured in Project Properties.' : 'Ensure your inventory is correctly entered in The Vault.'"
    empty-icon="flask"
    :skeleton-component="LaboratorySkeleton"
    :skeleton-count="1"
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
      <TrajectoryList
        v-if="operation && operation.actions.length > 0"
        :actions="[...operation.actions]"
        :get-trajectory-memo-keys="getTrajectoryMemoKeys"
      />
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
</style>
