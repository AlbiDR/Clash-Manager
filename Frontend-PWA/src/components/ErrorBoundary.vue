<script setup lang="ts">
import { ref, onErrorCaptured } from 'vue'
import Icon from './Icon.vue'

const error = ref<any>(null)

onErrorCaptured((err) => {
    error.value = err
    console.error('Captured by ErrorBoundary:', err)
    return false // Stop propagation
})

function reset() {
    error.value = null
    window.location.reload() // Safest recovery
}
</script>

<template>
    <div v-if="error" class="error-boundary">
        <div class="error-content">
            <div class="error-icon-wrapper">
                <Icon name="warning" size="48" />
            </div>
            <h2>System Recovery</h2>
            <p>Something went wrong while rendering this section.</p>
            
            <div class="error-details" v-if="error.message">
                {{ error.message }}
            </div>

            <button class="recover-btn" @click="reset">
                <span>Attempt Recovery</span>
            </button>
        </div>
    </div>
    <slot v-else></slot>
</template>

<style scoped>
.error-boundary {
    padding: 40px 20px;
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 200px;
}

.error-content {
    background: var(--sys-color-surface-container-high);
    padding: 32px;
    border-radius: 28px;
    text-align: center;
    max-width: 400px;
    width: 100%;
    border: 1px solid var(--sys-surface-glass-border);
    box-shadow: 0 10px 30px rgba(0,0,0,0.1);
}

.error-icon-wrapper {
    width: 80px;
    height: 80px;
    background: #ff444415;
    color: #ff4444;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 20px;
}

h2 { margin: 0 0 8px; font-weight: 900; color: var(--sys-color-on-surface); }
p { margin: 0 0 24px; opacity: 0.7; font-size: 14px; }

.error-details {
    background: rgba(0,0,0,0.05);
    padding: 12px;
    border-radius: 12px;
    font-family: monospace;
    font-size: 11px;
    text-align: left;
    margin-bottom: 24px;
    word-break: break-all;
    max-height: 100px;
    overflow-y: auto;
}

.recover-btn {
    background: var(--sys-color-primary);
    color: var(--sys-color-on-primary);
    border: none;
    padding: 12px 24px;
    border-radius: 99px;
    font-weight: 700;
    cursor: pointer;
    transition: transform 0.2s;
}

.recover-btn:active { transform: scale(0.95); }
</style>
