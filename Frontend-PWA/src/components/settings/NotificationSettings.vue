<script setup lang="ts">
import { useModules } from '../../composables/useModules'
import { useHaptics } from '../../composables/useHaptics'
import SettingsCard from '../SettingsCard.vue'
import Icon from '../Icon.vue'

const { modules, toggle } = useModules()
const haptics = useHaptics()

function handleToggle() {
    haptics.tap()
    toggle('notificationBadgeHighPotential')
}
</script>

<template>
    <SettingsCard v-if="modules.experimentalNotifications" title="Notifications" icon="bell">
        <div class="features-list">
            <div class="toggle-row" @click="handleToggle">
                <div class="row-info">
                   <div class="row-label">Advanced App Badge</div>
                    <div class="row-desc">Show count of recruits with score > 75</div>
                </div>
                <div class="switch" :class="{ active: modules.notificationBadgeHighPotential }">
                    <div class="handle"></div>
                </div>
            </div>
        </div>
        <div class="badge-preview" v-if="modules.notificationBadgeHighPotential">
            <Icon name="info" size="14" />
            <span>Focuses your attention on high-potential talent only.</span>
        </div>
    </SettingsCard>
</template>

<style scoped>
.features-list { display: flex; flex-direction: column; gap: 16px; }
.toggle-row { display: flex; align-items: center; justify-content: space-between; cursor: pointer; }

.row-label { font-weight: 800; font-size: 15px; color: var(--sys-color-on-surface); }
.row-desc { font-size: 13px; opacity: 0.6; }

.switch { width: 44px; height: 24px; background: var(--sys-color-surface-container-highest); border-radius: 12px; position: relative; transition: 0.3s; border: 1.5px solid rgba(0,0,0,0.1); }
.switch.active { background: var(--sys-color-primary); }
.switch .handle { position: absolute; top: 2px; left: 2px; width: 17px; height: 17px; background: white; border-radius: 50%; transition: 0.3s; }
.switch.active .handle{ left: calc(100% - 19px); }

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
</style>
