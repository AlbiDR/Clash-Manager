<script setup lang="ts">
defineProps<{
  message: string
}>()

defineEmits<{
  retry: []
}>()
</script>

<template>
  <div class="error-state animate-pulse-glow">
    <span class="error-icon">⚠️</span>
    <p class="error-message">{{ message }}</p>
    <button class="btn-primary" @click="$emit('retry')">
      <span>🔄</span>
      Try Again
    </button>
  </div>
</template>

<style scoped>
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 3rem 2rem;
  text-align: center;
  background: var(--md-sys-color-error-container);
  color: var(--md-sys-color-on-error-container);
  border-radius: var(--md-sys-shape-corner-large);
}

.error-icon {
  font-size: 2.5rem;
}

.error-message {
  font-weight: 500;
  margin: 0;
  max-width: 300px;
}
</style>
