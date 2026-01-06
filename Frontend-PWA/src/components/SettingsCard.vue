<script setup lang="ts">
import Icon from "./Icon.vue";

defineProps<{
  title: string;
  icon: string;
  loading?: boolean;
  bodyClass?: string;
}>();
</script>

<template>
  <div class="settings-card" :aria-busy="loading ? 'true' : 'false'">
    <div class="card-header">
      <Icon :name="icon" size="20" class="header-icon" />
      <h3>{{ title }}</h3>
    </div>
    <div class="card-body" :class="bodyClass">
      <slot />
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
  display: flex;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

.card-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 850;
  color: var(--sys-color-on-surface);
}

.header-icon {
  color: var(--sys-color-primary);
}

.card-body {
  padding: 20px;
}
</style>
