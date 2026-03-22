<script setup lang="ts">
import { ref, onErrorCaptured } from "vue";

/**
 * [GUARD] ERROR BOUNDARY
 * Resilience #45: Captures runtime errors and provides a graceful recovery path.
 */
const error = ref<Error | null>(null);
const copied = ref(false);

onErrorCaptured((err) => {
  error.value = err instanceof Error ? err : new Error(String(err));
  console.error("[GUARD] CAPTURED BY ERRORBOUNDARY:", err);
  return false; // Stop propagation to prevent app-wide crash
});

/**
 * Copies the error details to the clipboard.
 */
async function copyError() {
  if (!error.value) return;

  const title = "System Resilience";
  const description =
    "A rendering anomaly was detected. Our self-healing systems are standing by.";
  const content = `[${title}]\nAnomaly: ${description}\n\nMessage: ${error.value.message}\n\nStack: ${error.value.stack || "N/A"}`;

  try {
    await navigator.clipboard.writeText(content);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch (err) {
    console.error("[GUARD] FAILED TO COPY ERROR DETAILS:", err);
  }
}

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
          <path
            fill="currentColor"
            d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Zm1 15h-2v-2h2v2Zm0-4h-2V7h2v6Z"
              :vector-effect="'non-scaling-stroke'"
          />
        </svg>
      </div>
      <h2>System Resilience</h2>
      <p>
        A rendering anomaly was detected. Our self-healing systems are standing
        by.
      </p>

      <div class="error-details-container">
        <div class="error-details" v-if="error.message">
          {{ error.message }}
        </div>
        <button
          class="copy-btn"
          :class="{ copied }"
          @click="copyError"
          title="Copy Error Details"
        >
          <svg v-if="!copied" viewBox="0 0 24 24" width="18" height="18">
            <path
              fill="currentColor"
              d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1Zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2Zm0 16H8V7h11v14Z"
                :vector-effect="'non-scaling-stroke'"
            />
          </svg>
          <svg v-else viewBox="0 0 24 24" width="18" height="18">
            <path
              fill="currentColor"
              d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2Z"
                :vector-effect="'non-scaling-stroke'"
            />
          </svg>
        </button>
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

  padding: 40px;
  border-radius: 32px;
  text-align: center;
  max-width: 440px;
  width: 100%;
  border: 1px solid var(--sys-surface-glass-border);
  box-shadow: var(--sys-shadow-xl);
  user-select: text; /* Enable selection on entire content */
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
  user-select: none; /* Keep icon non-selectable */
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

.error-details-container {
  position: relative;
  margin-bottom: 32px;
}

.error-details {
  background: rgba(0, 0, 0, 0.04);
  padding: 16px 48px 16px 16px;
  border-radius: 16px;
  font-family: var(--sys-font-mono, monospace);
  font-size: 12px;
  text-align: left;
  word-break: break-all;
  max-height: 120px;
  overflow-y: auto;
  color: var(--sys-color-on-surface-variant);
  border: 1px solid rgba(0, 0, 0, 0.05);
  user-select: text;
}

.copy-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: none;
  background: var(--sys-color-surface-container-high);
  color: var(--sys-color-on-surface-variant);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s var(--sys-motion-spring);
  padding: 0;
  user-select: none; /* Keep button non-selectable */
}

.copy-btn:hover {
  background: var(--sys-color-surface-container-highest);
  color: var(--sys-color-primary);
  transform: scale(1.05);
}

.copy-btn:active {
  transform: scale(0.95);
}

.copy-btn.copied {
  background: var(--sys-color-primary);
  color: var(--sys-color-on-primary);
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

.recover-btn span {
  user-select: none;
}
</style>
