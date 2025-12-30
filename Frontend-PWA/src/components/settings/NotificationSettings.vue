<script setup lang="ts">
import { computed } from 'vue'
import { useModules } from '../../composables/useModules'
import { useHaptics } from '../../composables/useHaptics'
import SettingsCard from '../SettingsCard.vue'
import Icon from '../Icon.vue'

const { modules } = useModules()
const haptics = useHaptics()

const threshold = computed(() => modules.value.notificationThreshold)

function setThreshold(value: 50 | 75) {
    haptics.tap()
    modules.value.notificationThreshold = value
}
</script>

<template>
    <SettingsCard v-if="modules.experimentalNotifications" title="Notifications" icon="bell">
        <div class="notification-section">
            <div class="section-header">
                <div class="row-label">Badge Threshold</div>
                <div class="row-desc">Show badge for recruits with score</div>
            </div>
            
            <div class="threshold-selector">
                <button 
                    :class="{ active: threshold === 50 }" 
                    @click="setThreshold(50)"
                    class="threshold-btn"
                >
                    <span class="threshold-symbol">≥</span>50
                </button>
                <button 
                    :class="{ active: threshold === 75 }"
                    @click="setThreshold(75)"
                    class="threshold-btn"
                >
                    <span class="threshold-symbol">≥</span>75
                </button>
            </div>
        </div>
        
        <div class="badge-preview">
            <Icon name="info" size="14" />
            <span>{{ threshold === 75 ? 'Focus on high-potential talent only' : 'Show all good recruits' }}</span>
        </div>
    </SettingsCard>
</template>

<style scoped>
.notification-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.section-header {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.row-label { 
    font-weight: 800; 
    font-size: 15px; 
    color: var(--sys-color-on-surface); 
}

.row-desc { 
    font-size: 13px; 
    opacity: 0.6; 
}

/* Elegant threshold selector matching Console Header pill style */
.threshold-selector {
    display: flex;
    background: var(--sys-color-surface-container-high);
    padding: 4px;
    border-radius: 99px;
    gap: 4px;
    width: fit-content;
}

.threshold-btn {
    flex: 1;
    min-width: 80px;
    height: 40px;
    padding: 0 18px;
    border: none;
    background: transparent;
    color: var(--sys-color-outline);
    border-radius: 99px;
    font-weight: 800;
    font-size: 14px;
    font-family: var(--sys-font-family-mono);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 2px;
    transition: all 0.2s var(--sys-motion-spring);
}

.threshold-symbol {
    font-size: 16px;
    opacity: 0.7;
}

.threshold-btn.active {
    background: var(--sys-color-primary);
    color: var(--sys-color-on-primary);
    box-shadow: 0 4px 12px rgba(var(--sys-color-primary-rgb), 0.25);
    transform: scale(1.02);
}

.threshold-btn.active .threshold-symbol {
    opacity: 1;
}

.threshold-btn:hover:not(.active) {
    background: rgba(var(--sys-color-primary-rgb), 0.08);
    color: var(--sys-color-on-surface);
}

.threshold-btn:active {
    transform: scale(0.96);
}

.badge-preview {
    margin-top: 4px;
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
