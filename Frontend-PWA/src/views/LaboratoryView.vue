import { BaseCardSkeleton, Icon } from "@shared";
import { useClashData } from "@core";
<script setup lang="ts">
import { computed } from "vue";
import { useLaboratory } from "../composables/useLaboratory";
import ConsoleLayout from "../components/ConsoleLayout.vue";
// Laboratory Components
import VaultCard from "../components/Laboratory/VaultCard.vue";
import ParameterCard from "../components/Laboratory/ParameterCard.vue";
import SummaryCard from "../components/Laboratory/SummaryCard.vue";
import TrajectoryItem from "../components/Laboratory/TrajectoryItem.vue";

const {
  observation,
  operation,
  settings,
  isFetching,
  isSimulating,
  fetchError,
  updateInventory,
  setSettings,
  refresh,
} = useLaboratory();

const { data: globalData } = useClashData();

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

const handleResourceUpdate = (key: string, value: number) => {
  if (key === 'gold') updateInventory({ gold: value });
  else if (key === 'gems') updateInventory({ gems: value });
  else if (key.startsWith('wc_')) {
    const rawRarity = key.split('_')[1];
    const capitalized = (rawRarity.charAt(0).toUpperCase() + rawRarity.slice(1)) as Rarity;
    updateInventory({ 
      wildCards: { 
        [capitalized]: value 
      } as Partial<Record<Rarity, number>>
    });
  }
};

</script>

<template>
  <ConsoleLayout
    title="Laboratory"
    :status="{ type: statusType, text: statusText }"
    :loading="isFetching"
    :is-empty="isEmpty"
    :skeleton-component="BaseCardSkeleton"
    :sync-error="fetchError || undefined"
    @refresh="refresh"
  >
    <template #empty-action>
      <div v-if="!globalData?.playerTag" class="setup-hint">
        <p>No <b>PlayerTag</b> configured in Project Properties.</p>
        <router-link to="/settings" class="btn-primary">
          <Icon name="settings" size="18" />
          <span>Configure Settings</span>
        </router-link>
      </div>
    </template>

    <!-- Simulation Dashboard -->
    <div v-if="observation" class="dashboard-grid">
      <!-- 1. The Vault & Settings -->
      <div class="dashboard-sidebar">
        <VaultCard 
          :inventory="observation.inventory"
          :is-simulating="isSimulating"
          @update="handleResourceUpdate"
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

.glass-panel {
  background: var(--sys-surface-glass);
  backdrop-filter: var(--sys-surface-glass-blur);
  border: 1px solid var(--sys-surface-glass-border);
  border-radius: var(--shape-corner-l);
  padding: 16px;
  box-shadow: var(--sys-elevation-2);
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 850;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  opacity: 0.7;
  margin-bottom: 16px;
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

.setup-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  text-align: center;
  padding: 60px 20px;
}

.setup-hint p {
  font-size: 16px;
  opacity: 0.7;
}

.btn-primary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  background: var(--sys-color-primary);
  color: var(--sys-color-on-primary);
  border-radius: var(--shape-corner-full);
  font-weight: 850;
  text-decoration: none;
  box-shadow: 0 4px 12px rgba(var(--sys-color-primary-rgb), 0.3);
}
</style>
