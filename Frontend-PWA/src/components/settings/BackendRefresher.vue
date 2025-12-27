
<script setup lang="ts">
import { ref, reactive, onUnmounted, computed } from 'vue'
import { triggerBackendUpdate } from '../../api/gasClient'
import Icon from '../Icon.vue'
import { useClanData } from '../../composables/useClanData'

// Types
type TargetKey = 'members' | 'leaderboard' | 'headhunters'

interface RefreshTarget {
    key: TargetKey
    label: string
    desc: string
    icon: string
    cooldown: number
    timer: number | null
    status: 'idle' | 'loading' | 'success' | 'error' | 'cooldown'
}

// State
const targets = reactive<Record<TargetKey, RefreshTarget>>({
    members: {
        key: 'members',
        label: 'Clan Members',
        desc: 'Update member list and roles',
        icon: 'group',
        cooldown: 0,
        timer: null,
        status: 'idle'
    },
    leaderboard: {
        key: 'leaderboard',
        label: 'Leaderboard',
        desc: 'Recalculate scores and ranks',
        icon: 'leaderboard',
        cooldown: 0,
        timer: null,
        status: 'idle'
    },
    headhunters: {
        key: 'headhunters',
        label: 'Headhunters',
        desc: 'Refresh internal recruit data',
        icon: 'target',
        cooldown: 0,
        timer: null,
        status: 'idle'
    }
})

const { isRefreshing } = useClanData() // Get global refreshing state

// Logic
const startCooldown = (key: TargetKey) => {
    const target = targets[key]
    target.cooldown = 60
    target.status = 'cooldown'
    
    if (target.timer) clearInterval(target.timer)
    
    target.timer = window.setInterval(() => {
        target.cooldown--
        if (target.cooldown <= 0) {
            if (target.timer) clearInterval(target.timer)
            target.timer = null
            target.status = 'idle'
        }
    }, 1000)
}

const refresh = async (key: TargetKey) => {
    const target = targets[key]
    if (target.status === 'loading' || target.cooldown > 0) return

    target.status = 'loading'

    try {
        const response = await triggerBackendUpdate(key)
        if (response.status === 'success') {
             startCooldown(key)
        } else {
            // Still cooldown on failure to prevent spam
             startCooldown(key)
        }
    } catch (e) {
        console.error(`Backend refresh failed [${key}]`, e)
         startCooldown(key) // Cooldown on error too
    }
}

// Cleanup
onUnmounted(() => {
    Object.values(targets).forEach(t => {
        if (t.timer) clearInterval(t.timer)
    })
})
</script>

<template>
    <div class="settings-card" :aria-busy="isRefreshing ? 'true' : 'false'">
        <div class="card-header">
            <Icon name="refresh" size="20" class="header-icon" />
            <h3>Backend Refresh</h3>
        </div>
        <div class="card-body">
            <div class="rows-container">
                <div v-for="target in targets" :key="target.key" class="refresh-row">
                    <div class="row-info">
                        <template v-if="isRefreshing">
                          <div class="sk-text-line-m" style="width: 100px;"></div>
                          <div class="sk-text-line-s" style="width: 150px;"></div>
                        </template>
                        <template v-else>
                          <div class="row-label">{{ target.label }}</div>
                          <div class="row-desc">{{ target.desc }}</div>
                        </template>
                    </div>
                    
                    <button 
                        class="action-btn" 
                        @click="refresh(target.key)" 
                        :disabled="target.status === 'loading' || target.cooldown > 0"
                        :class="{ 'is-loading': target.status === 'loading', 'skeleton-anim sk-button-m': isRefreshing }"
                    >
                        <!-- Normal State -->
                        <template v-if="isRefreshing">
                          <!-- Skeleton button covers button, not text -->
                        </template>
                        <template v-else-if="target.status === 'idle' || target.status === 'error'">
                            <span>REFRESH</span>
                        </template>

                        <!-- Loading State -->
                        <template v-else-if="target.status === 'loading'">
                            <div class="spinner"></div>
                        </template>

                        <!-- Cooldown State -->
                        <template v-else-if="target.status === 'cooldown'">
                            <span class="cooldown-text">{{ target.cooldown }}s</span>
                        </template>
                    </button>
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
}

.card-header {
  padding: 16px 20px;
  display: flex; align-items: center; gap: 12px;
  border-bottom: 1px solid rgba(0,0,0,0.05);
}
.card-header h3 { margin: 0; font-size: 16px; font-weight: 850; color: var(--sys-color-on-surface); }
.header-icon { color: var(--sys-color-primary); }

.card-body { padding: 0; }

.refresh-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid rgba(0,0,0,0.05);
}
.refresh-row:last-child { border-bottom: none; }

.row-info { display: flex; flex-direction: column; gap: 2px; }
.row-label { font-weight: 800; font-size: 14px; color: var(--sys-color-on-surface); }
.row-desc { font-size: 12px; opacity: 0.5; }

.action-btn {
    display: flex; align-items: center; justify-content: center;
    background: var(--sys-color-secondary-container);
    color: var(--sys-color-on-secondary-container);
    border: none;
    padding: 8px 16px;
    border-radius: 8px;
    font-weight: 700;
    font-size: 11px;
    cursor: pointer;
    min-width: 80px;
    height: 32px;
    transition: all 0.2s;
    position: relative; /* For skeleton overlay */
}
.action-btn.skeleton-anim.sk-button-m {
  background: none; /* Hide native background for skeleton */
  border: none;
  color: transparent; /* Hide native text for skeleton */
}
.action-btn.skeleton-anim.sk-button-m::before {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--sh-sk-secondary); /* Skeleton background */
  border-radius: 8px;
  animation: pulse 1.5s infinite ease-in-out;
}


.action-btn:hover:not(:disabled) {
    background: var(--sys-color-primary);
    color: white;
}

.action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background: var(--sys-color-surface-variant);
    color: var(--sys-color-on-surface-variant);
}

.spinner {
    width: 14px; height: 14px;
    border: 2px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    opacity: 0.6;
}

@keyframes spin {
    to { transform: rotate(360deg); }
}

.cooldown-text {
    font-variant-numeric: tabular-nums;
}
</style>
