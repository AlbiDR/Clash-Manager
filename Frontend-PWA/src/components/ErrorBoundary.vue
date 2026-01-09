<script setup lang="ts">
import { ref, onErrorCaptured } from "vue";

/**
 * 🛡️ ERROR BOUNDARY
 * Resilience #45: Captures runtime errors and provides a graceful recovery path.
 */
const error = ref<Error | null>(null);

onErrorCaptured((err) => {
  error.value = err instanceof Error ? err : new Error(String(err));
  console.error("Captured by ErrorBoundary:", err);
  return false; // Stop propagation to prevent app-wide crash
});

/**
 * Resets the application state and reloads the page.
 */
function reset() {
  error.value = null;
  // Clear any potentially corrupted temporary state
  sessionStorage.clear();
  window.location.reload(); 
}
</script>

<template>
  <div v-if="error" class="error-boundary">
    <div class="error-content">
      <div class="error-icon-wrapper">
        <svg viewBox="0 0 24 24" width="32" height="32">
          <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Zm1 15h-2v-2h2v2Zm0-4h-2V7h2v6Z"/>
        </svg>
      </div>
      <h2>System Resilience</h2>
      <p>A rendering anomaly was detected. Our self-healing systems are standing by.</p>

      <div class="error-details" v-if="error.message">
        {{ error.message }}
      </div>

      <button class="recover-btn" @click="reset">
        <span>Re-Initialize System</span>
      </button>
    </div>
  </div>
  <slot v-else></slot>
</template>

<style scoped>
.error-boundary {
  padding: 60px 24px;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 300px;
}

.error-content {
  background: var(--sys-surface-glass);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  padding: 40px;
  border-radius: 32px;
  text-align: center;
  max-width: 440px;
  width: 100%;
  border: 1px solid var(--sys-surface-glass-border);
  box-shadow: var(--sys-shadow-xl);
}

.error-icon-wrapper {
  width: 72px;
  height: 72px;
  background: rgba(var(--sys-color-error-rgb, 255, 68, 68), 0.1);
  color: var(--sys-color-error);
  border-radius: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 24px;
  transform: rotate(-5deg);
}

h2 {
  margin: 0 0 12px;
  font-weight: 850;
  letter-spacing: -0.02em;
  color: var(--sys-color-on-surface);
}

p {
  margin: 0 0 28px;
  line-height: 1.6;
  font-size: 15px;
  color: var(--sys-color-on-surface-variant);
}

.error-details {
  background: rgba(0, 0, 0, 0.04);
  padding: 16px;
  border-radius: 16px;
  font-family: var(--sys-font-mono, monospace);
  font-size: 12px;
  text-align: left;
  margin-bottom: 32px;
  word-break: break-all;
  max-height: 120px;
  overflow-y: auto;
  color: var(--sys-color-on-surface-variant);
  border: 1px solid rgba(0, 0, 0, 0.05);
}

.recover-btn {
  background: var(--sys-color-primary);
  color: var(--sys-color-on-primary);
  border: none;
  padding: 14px 32px;
  border-radius: 99px;
  font-weight: 750;
  font-size: 15px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.2, 0, 0, 1);
  box-shadow: 0 8px 16px rgba(var(--sys-color-primary-rgb), 0.3);
}

.recover-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 20px rgba(var(--sys-color-primary-rgb), 0.4);
}

.recover-btn:active {
  transform: scale(0.96);
}
</style>

