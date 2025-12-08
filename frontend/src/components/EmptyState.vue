<script setup lang="ts">
defineProps<{
  icon?: string
  message: string
  hint?: string
}>()
</script>

<template>
  <div class="empty-state animate-fade-in">
    <span class="empty-icon">{{ icon || '🔭' }}</span>
    <p class="empty-message">{{ message }}</p>
    <p v-if="hint" class="empty-hint">{{ hint }}</p>
    <slot name="action"></slot>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 4rem 2rem;
  text-align: center;
  background: var(--md-sys-color-surface-container);
  border-radius: var(--md-sys-shape-corner-large);
  border: 1px dashed var(--md-sys-color-outline-variant);
}

.empty-icon {
  font-size: 3rem;
  background: var(--md-sys-color-surface-container-high);
  width: 5rem;
  height: 5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  margin-bottom: 0.5rem;
}

.empty-message {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--md-sys-color-on-surface);
  margin: 0;
}

.empty-hint {
  font-size: 0.875rem;
  color: var(--md-sys-color-on-surface-variant);
  max-width: 240px;
  line-height: 1.5;
}
</style>
