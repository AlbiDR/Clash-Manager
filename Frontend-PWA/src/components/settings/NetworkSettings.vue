
<script setup lang="ts">
import { useModules } from '../../composables/useModules'
import { useHaptics } from '../../composables/useHaptics'
import Icon from '../Icon.vue'
import { useClanData } from '../../composables/useClanData'
import { computed } from 'vue'

const { modules, toggle } = useModules()
const haptics = useHaptics()
const { isRefreshing } = useClanData()
const showSkeletons = computed(() => isRefreshing.value)

function handleToggle() {
    haptics.tap()
    toggle('notificationBadgeHighPotential')
}
</script>

<template>
    <div v-if="modules.experimentalNotifications" class="settings-card" :aria-busy="showSkeletons ? 'true' : 'false'">
        <div class="card-header">
            <Icon name="bell" size="20" class="header-icon" />
            <h3>Notifications</h3>
        </div>
        <div class="card-body">
            <div class="features-list">
                <div class="toggle-row" @click="handleToggle">
                    <div class="row-info">
                        <template v-if="showSkeletons">
                          <div class="sk-text-line-m" style="width: 120px;"></div>
                          <div class="sk-text-line-s" style="width: 160px;"></div>
                        </template>
                        <template v-else>
                          <div class="row-label">Advanced App Badge</div>
                          <div class="row-desc">Show count of recruits with score > 75</div>
                        </template>
                    </div>
                    <div class="switch" :class="{ active: modules.notificationBadgeHighPotential, 'skeleton-anim sk-badge-s': showSkeletons }">
                        <div class="handle"></div>
                    </div>
                </div>
            </div>
            <div class="badge-preview skeleton-anim" v-if="modules.notificationBadgeHighPotential" :class="{'skeleton-anim sk-url-readout': showSkeletons}">
                <template v-if="showSkeletons">
                  <div class="sk-icon-small"></div>
                  <div class="sk-text-line-s" style="width: 80%;"></div>
                </template>
                <template v-else>
                  <Icon name="info" size="14" />
                  <span>Focuses your attention on high-potential talent only.</span>
                </template>
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

.badge-preview {
  margin-top: 16px;
  padding: 12px;
  background: rgba(var(--sys-color-primary-rgb), 0.05);
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  font-weight: 600;
  color: var(--sys-color-on-surface-variant);
  opacity: 0.8;
}
.badge-preview.skeleton-anim {
  background: none; /* Hide native background for skeleton */
}
.badge-preview.skeleton-anim.sk-url-readout {
  padding: 12px; /* Ensure skeleton matches padding */
}
</style>
