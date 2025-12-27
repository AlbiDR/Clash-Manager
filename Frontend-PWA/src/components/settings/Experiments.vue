
<script setup lang="ts">
import { computed } from 'vue'
import { useModules } from '../../composables/useModules'
import { useWakeLock } from '../../composables/useWakeLock'
import { useDemoMode } from '../../composables/useDemoMode'
import { useClanData } from '../../composables/useClanData' // Import useClanData
import Icon from '../Icon.vue'

const { modules, toggle } = useModules()
const wakeLock = useWakeLock()
const { isDemoMode, toggleDemoMode } = useDemoMode()
const { isRefreshing } = useClanData() // Get global refreshing state
const showSkeletons = computed(() => isRefreshing.value)
</script>

<template>
    <div class="settings-card" :aria-busy="showSkeletons ? 'true' : 'false'">
        <div class="card-header">
            <Icon name="flask" size="20" class="header-icon" />
            <h3>Experiments</h3>
        </div>
        <div class="card-body">
            <div class="features-list">
            
            <div class="toggle-row" @click="toggle('ghostBenchmarking')">
                <div class="row-info">
                  <template v-if="showSkeletons">
                    <div class="sk-text-line-m" style="width: 140px;"></div>
                    <div class="sk-text-line-s" style="width: 200px;"></div>
                  </template>
                  <template v-else>
                    <div class="row-label">Ghost Benchmarking</div>
                    <div class="row-desc">Visualize clan averages inside stat tooltips</div>
                  </template>
                </div>
                <div class="switch" :class="{ active: modules.ghostBenchmarking, 'skeleton-anim sk-badge-s': showSkeletons }">
                  <div class="handle"></div>
                </div>
            </div>

            <div class="toggle-row" @click="toggleDemoMode">
                <div class="row-info">
                  <template v-if="showSkeletons">
                    <div class="sk-text-line-m" style="width: 160px;"></div>
                    <div class="sk-text-line-s" style="width: 220px;"></div>
                  </template>
                  <template v-else>
                    <div class="row-label">Portfolio Demo Mode</div>
                    <div class="row-desc">Use mock data engine for technical showcase</div>
                  </template>
                </div>
                <div class="switch" :class="{ active: isDemoMode, 'skeleton-anim sk-badge-s': showSkeletons }">
                  <div class="handle"></div>
                </div>
            </div>

            <div v-if="wakeLock.isSupported" class="toggle-row" @click="wakeLock.toggle()">
                <div class="row-info">
                  <template v-if="showSkeletons">
                    <div class="sk-text-line-m" style="width: 100px;"></div>
                    <div class="sk-text-line-s" style="width: 180px;"></div>
                  </template>
                  <template v-else>
                    <div class="row-label">Keep Screen On</div>
                    <div class="row-desc">Prevent display sleep during clan management</div>
                  </template>
                </div>
                <div class="switch" :class="{ active: wakeLock.isActive.value, 'skeleton-anim sk-badge-s': showSkeletons }">
                  <div class="handle"></div>
                </div>
            </div>

            </div>
        </div>
    </div>
</template>

<style scoped>
.settings-card {
  background: var(--sys-color-surface-container);
  border-radius: 24px;
  border: 1px solid var(--sys-surface-glass-border);
  overflow: hidden;
  transition: background-color 0.3s ease;
}

.card-header {
  padding: 16px 20px;
  display: flex; align-items: center; gap: 12px;
  border-bottom: 1px solid rgba(0,0,0,0.05);
}
.card-header h3 { margin: 0; font-size: 16px; font-weight: 850; color: var(--sys-color-on-surface); }
.header-icon { color: var(--sys-color-primary); }

.card-body { padding: 20px; }

.features-list { display: flex; flex-direction: column; gap: 16px; }
.toggle-row { display: flex; align-items: center; justify-content: space-between; cursor: pointer; }

.row-info { display: flex; flex-direction: column; gap: 4px; flex: 1; }
.row-label { font-weight: 800; font-size: 15px; color: var(--sys-color-on-surface); }
.row-desc { font-size: 13px; opacity: 0.6; }

.switch { width: 44px; height: 24px; background: var(--sys-color-surface-container-highest); border-radius: 12px; position: relative; transition: 0.3s; border: 1.5px solid rgba(0,0,0,0.1); }
.switch.active { background: var(--sys-color-primary); }
.switch .handle { position: absolute; top: 2px; left: 2px; width: 17px; height: 17px; background: white; border-radius: 50%; transition: 0.3s; }
.switch.active .handle { left: calc(100% - 19px); }
.switch.skeleton-anim.sk-badge-s {
  background: none; /* Hide native background for skeleton */
  border: none;
  position: relative;
  overflow: hidden;
}
.switch.skeleton-anim.sk-badge-s::before {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--sh-sk-secondary); /* Skeleton background */
  border-radius: 12px;
  animation: pulse 1.5s infinite ease-in-out;
}
</style>
