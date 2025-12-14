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
    <div class="error-icon-box">
      <Icon name="warning" size="40" />
    </div>
    <p class="error-message">{{ message }}</p>
    <button class="btn-primary" @click="$emit('retry')">
      <Icon name="refresh" size="18" />
      <span>Try Again</span>
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
  background: var(--sys-color-error-container);
  color: var(--sys-color-on-error-container);
  border-radius: var(--shape-corner-l);
}

.error-icon-box {
  color: var(--sys-color-error);
  margin-bottom: 8px;
}

.error-message {
  font-weight: 500;
  margin: 0;
  max-width: 300px;
}
</style>
