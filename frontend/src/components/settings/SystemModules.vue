<script setup lang="ts">
import { useApiState } from '../../composables/useApiState'
import Icon from '../Icon.vue'

const { pingData } = useApiState()
</script>

<template>
    <div v-if="pingData?.modules" class="settings-card">
        <div class="card-header">
            <Icon name="box" size="20" class="header-icon" />
            <h3>System Modules</h3>
        </div>
        <div class="card-body">
            <div class="module-grid">
            <div v-for="(ver, name) in pingData.modules" :key="name" class="module-item">
                <span class="m-name">{{ name }}</span>
                <span class="m-ver">v{{ ver }}</span>
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

.module-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1px; background: rgba(0,0,0,0.05); border-radius: 12px; overflow: hidden; }
.module-item { background: var(--sys-color-surface-container-high); padding: 12px; display: flex; flex-direction: column; gap: 2px; }
.m-name { font-size: 10px; font-weight: 800; opacity: 0.5; text-transform: uppercase; }
.m-ver { font-size: 14px; font-weight: 700; font-family: var(--sys-font-family-mono); color: var(--sys-color-primary); }
</style>
