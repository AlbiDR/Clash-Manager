<script setup lang="ts">

/**
 * LABORATORY SKELETON
 * 
 * perfectly representative placeholder matching the Dashboard Grid
 * configuration of the Laboratory view.
 */
</script>

<template>
  <div class="laboratory-skeleton">
    <div class="dashboard-grid">
      <!-- 1. The Vault & Settings (Sidebar Grid) -->
      <div class="dashboard-sidebar">
        
        <!-- Vault Skeleton -->
        <div class="sk-panel glass-panel skeleton-anim">
          <div class="sk-panel-header">
            <div class="sk-icon-dot"></div>
            <div class="sk-text-line-m" style="width: 80px;"></div>
          </div>
          <div class="sk-grid-2">
            <div class="sk-res-col"><div class="sk-label-box"></div><div class="sk-input"></div></div>
            <div class="sk-res-col"><div class="sk-label-box"></div><div class="sk-input"></div></div>
          </div>
          <div class="sk-wc-section">
            <div class="sk-label-box" style="width: 100px;"></div>
             <div class="sk-wc-row">
               <div class="sk-wc-col" v-for="i in 5" :key="i">
                 <div class="sk-box" style="width: 32px; height: 32px; border-radius: 6px;"></div>
                 <div class="sk-input" style="height: 28px; width: 100%;"></div>
               </div>
             </div>
          </div>
        </div>

        <!-- Parameters Skeleton -->
        <div class="sk-panel glass-panel skeleton-anim" style="animation-delay: 0.1s;">
          <div class="sk-panel-header">
            <div class="sk-icon-dot"></div>
            <div class="sk-text-line-m" style="width: 90px;"></div>
          </div>
          <div class="sk-vstack">
            <div class="sk-label-box" style="width: 120px;"></div>
            <div class="sk-button-m" style="height: 36px;"></div>
            <div class="sk-input" style="height: 80px; border-radius: 8px;"></div>
            
            <div class="sk-label-box" style="width: 100px; margin-top: 8px;"></div>
            <div class="sk-input" style="height: 44px;"></div>

            <div class="sk-toggle-row">
               <div class="sk-vstack" style="gap: 4px;">
                 <div class="sk-text-line-m" style="width: 130px;"></div>
                 <div class="sk-label-box" style="width: 90px;"></div>
               </div>
               <div class="sk-pill" style="width: 44px; height: 24px;"></div>
            </div>
          </div>
        </div>

      </div>

      <!-- 2. Result Summary Skeleton -->
      <div class="sk-panel glass-panel skeleton-anim" style="animation-delay: 0.2s;">
        <div class="sk-summary-header">
          <div class="sk-vstack">
            <div class="sk-text-line-m" style="width: 160px; height: 24px;"></div>
            <div class="sk-label-box" style="width: 80px;"></div>
          </div>
          <div class="sk-pill" style="width: 70px; height: 44px; border-radius: 12px;"></div>
        </div>
        <div class="sk-label-box" style="width: 100px; margin-top: 16px; margin-bottom: 8px;"></div>
        <div class="sk-progression-row">
           <div class="sk-input" style="height: 50px; width: 100px; border-radius: 14px;"></div>
           <div class="sk-box" style="width: 24px; height: 24px; border-radius: 50%;"></div>
           <div class="sk-input" style="height: 50px; width: 100px; border-radius: 14px;"></div>
        </div>

        <div class="sk-label-box" style="width: 120px; margin-top: 24px; margin-bottom: 8px;"></div>
        <div class="sk-grid-3">
           <div class="sk-input" style="height: 60px; border-radius: 16px;" v-for="i in 3" :key="i"></div>
        </div>
      </div>

      <!-- 3. Trajectory List Skeleton -->
      <div class="trajectory-section skeleton-anim" style="animation-delay: 0.3s;">
        <div class="section-title">
          <div class="sk-icon-dot" style="width: 18px; height: 18px;"></div>
          <div class="sk-text-line-m" style="width: 180px; height: 18px;"></div>
        </div>
        <div class="sk-trajectory-list">
          <div class="sk-traj-item" v-for="i in 3" :key="i">
            <div class="sk-traj-info">
              <div class="sk-text-line-m" style="width: 140px; height: 16px;"></div>
              <div class="sk-traj-row">
                 <div class="sk-pill" style="width: 50px; height: 20px; border-radius: 6px;"></div>
                 <div class="sk-label-box" style="width: 60px;"></div>
              </div>
              <div class="sk-pill" style="width: 80px; height: 24px; border-radius: 6px; margin-top: 4px;"></div>
            </div>
            <div class="sk-cost-stack">
              <div class="sk-value-box" style="width: 50px;"></div>
              <div class="sk-value-box" style="width: 70px;"></div>
              <div class="sk-value-box" style="width: 60px; height: 10px;"></div>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
.laboratory-skeleton {
  padding-bottom: 120px;
}

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
  background: var(--sh-surf-c);
  border-radius: var(--shape-corner-l);
  border: 1px solid rgba(128, 128, 128, 0.05);
  padding: 18px;
  display: flex;
  flex-direction: column;
}

.sk-panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 24px;
}

.sk-grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.sk-grid-3 {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

@media (max-width: 640px) {
  .sk-grid-3 {
    grid-template-columns: 1fr;
  }
}

.sk-res-col {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sk-wc-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-top: 16px;
  border-top: 1px solid var(--sys-color-outline-variant);
  margin-top: 24px;
}

.sk-wc-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.sk-wc-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 50px;
}

.sk-vstack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sk-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  border-top: 1px solid var(--sys-color-outline-variant);
  margin-top: 8px;
}

.sk-summary-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.sk-progression-row {
  display: flex;
  align-items: center;
  gap: 24px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 12px 0;
  padding: 0 8px;
}

.sk-trajectory-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sk-traj-item {
  display: flex;
  align-items: center;
  gap: 16px;
  background: var(--sh-sk);
  border: 1px solid var(--sys-color-outline-variant);
  border-radius: var(--shape-corner-large);
  padding: 14px 18px;
}

.sk-traj-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sk-traj-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.sk-cost-stack {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  min-width: 80px;
}
</style>
