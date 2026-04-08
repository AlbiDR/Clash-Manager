<script setup lang="ts">
import {
  Icon,
  ConsoleLayout
} from "@shared";
import { useClashDataStore } from "@core";
import { computed, ref } from "vue";
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
  layoutProps,
  setSettings,
  handleVaultUpdate,
  refresh,
  getTrajectoryMemoKeys,
} = useLaboratory();

const displayLimit = ref(20);

const displayedActions = computed(() => {
  if (!operation.value) return [];
  return operation.value.actions.slice(0, displayLimit.value);
});

const hasMoreActions = computed(() => {
  return (operation.value?.actions.length || 0) > displayLimit.value;
});

const expandTrajectory = () => {
  displayLimit.value = 999;
};

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
      <div v-if="operation && operation.actions.length > 0" class="trajectory-section">
        <h3 class="section-title">
          <Icon name="trend_up" size="18" />
          <span>Recommended Trajectory</span>
        </h3>
        <div class="trajectory-list">
          <TrajectoryItem 
            v-for="(upgrade, index) in displayedActions" 
            :key="`${upgrade.cardName}-${upgrade.targetLevel}`"
            v-memo="getTrajectoryMemoKeys(upgrade)"
            :upgrade="upgrade"
            :index="index"
          />
        </div>

        <!-- Expansion Control -->
        <button 
          v-if="hasMoreActions" 
          class="btn-ghost expand-btn"
          @click="expandTrajectory"
        >
          <Icon name="expand_more" size="18" />
          <span>Show More ({{ operation.actions.length - displayLimit }} remaining)</span>
        </button>
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

.expand-btn {
  margin-top: 12px;
  width: 100%;
  justify-content: center;
  color: var(--sys-color-primary);
  font-weight: 800;
  letter-spacing: 0.02em;
  background: var(--sys-color-surface-container-low);
  border: 1px dashed var(--sys-color-outline-variant);
}

.expand-btn:hover {
  background: var(--sys-color-surface-container);
  border-style: solid;
}
</style>
