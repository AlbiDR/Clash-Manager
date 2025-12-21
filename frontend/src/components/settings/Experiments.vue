<script setup lang="ts">
import { useModules } from '../../composables/useModules'
import Icon from '../Icon.vue'

const { modules, toggle } = useModules()
</script>

<template>
    <div class="settings-card">
        <div class="card-header">
            <Icon name="flask" size="20" class="header-icon" />
            <h3>Experiments</h3>
        </div>
        <div class="card-body">
            <div class="features-list">
            <div class="toggle-row" @click="toggle('blitzMode')">
                <div class="row-info">
                <div class="row-label">Blitz Mode</div>
                <div class="row-desc">Multi-tab profile navigation engine</div>
                </div>
                <div class="switch" :class="{ active: modules.blitzMode }">
                <div class="handle"></div>
                </div>
            </div>
            
            <div class="toggle-row" @click="toggle('sortExplanation')">
                <div class="row-info">
                <div class="row-label">Sort Explanations</div>
                <div class="row-desc">Show logic criteria next to sort filters</div>
                </div>
                <div class="switch" :class="{ active: modules.sortExplanation }">
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
