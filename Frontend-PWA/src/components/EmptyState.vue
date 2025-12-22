<script setup lang="ts">
import Icon from './Icon.vue'

defineProps<{
  icon?: string
  message: string
  hint?: string
}>()
</script>

<template>
  <div class="empty-state animate-fade-in">
    <div class="empty-icon-box">
      <Icon :name="icon || 'telescope'" size="48" />
    </div>
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
  background: var(--sys-color-surface-container);
  border-radius: var(--shape-corner-l);
  border: 1px dashed var(--sys-color-outline-variant);
}

.empty-icon-box {
  color: var(--sys-color-outline);
  opacity: 0.5;
  margin-bottom: 0.5rem;
}

.empty-message {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--sys-color-on-surface);
  margin: 0;
}

.empty-hint {
  font-size: 0.875rem;
  color: var(--sys-color-on-surface-variant);
  max-width: 240px;
  line-height: 1.5;
}
</style>
