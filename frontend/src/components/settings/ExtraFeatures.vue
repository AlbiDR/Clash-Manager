<script setup lang="ts">
import { useModules } from '../../composables/useModules'
import { useWakeLock } from '../../composables/useWakeLock'
import Icon from '../Icon.vue'

const { modules, toggle } = useModules()
const wakeLock = useWakeLock()
</script>

<template>
    <div class="settings-card">
        <div class="card-header">
            <Icon name="lightning" size="20" class="header-icon" />
            <h3>Extra Features</h3>
        </div>
        <div class="card-body">
            <div class="features-list">
            
            <div class="toggle-row" @click="toggle('ghostBenchmarking')">
                <div class="row-info">
                <div class="row-label">Ghost Benchmarking</div>
                <div class="row-desc">Visualize clan averages inside stat tooltips</div>
                </div>
                <div class="switch" :class="{ active: modules.ghostBenchmarking }">
                <div class="handle"></div>
                </div>
            </div>

            <div v-if="wakeLock.isSupported" class="toggle-row" @click="wakeLock.toggle()">
                <div class="row-info">
                <div class="row-label">Keep Screen On</div>
                <div class="row-desc">Prevent display sleep during clan management</div>
                </div>
                <div class="switch" :class="{ active: wakeLock.isActive.value }">
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

.row-label { font-weight: 800; font-size: 15px; color: var(--sys-color-on-surface); }
.row-desc { font-size: 13px; opacity: 0.6; }

.switch { width: 44px; height: 24px; background: var(--sys-color-surface-container-highest); border-radius: 12px; position: relative; transition: 0.3s; border: 1.5px solid rgba(0,0,0,0.1); }
.switch.active { background: var(--sys-color-primary); }
.switch .handle { position: absolute; top: 2px; left: 2px; width: 17px; height: 17px; background: white; border-radius: 50%; transition: 0.3s; }
.switch.active .handle { left: calc(100% - 19px); }
</style>
