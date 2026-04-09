<script setup lang="ts">
import { Icon } from "@shared";
import { useBackendRefresher } from "../composables/useBackendRefresher";

const { targets, isRefreshing, refresh } = useBackendRefresher();
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
              <div class="sk-text-line-m" style="width: 100px"></div>
              <div class="sk-text-line-s" style="width: 150px"></div>
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
            :class="{
              'is-loading': target.status === 'loading',
              'skeleton-anim sk-button-m': isRefreshing,
            }"
          >
            <!-- Normal State -->
            <template v-if="isRefreshing">
              <!-- Skeleton button covers button, not text -->
            </template>
            <template
              v-else-if="target.status === 'idle' || target.status === 'error'"
            >
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
  padding: 0;
}

.refresh-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}
.refresh-row:last-child {
  border-bottom: none;
}

.row-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.row-label {
  font-weight: 800;
  font-size: 14px;
  color: var(--sys-color-on-surface);
}
.row-desc {
  font-size: 12px;
  opacity: 0.5;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
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
  content: "";
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
  width: 14px;
  height: 14px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  opacity: 0.6;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.cooldown-text {
  font-variant-numeric: tabular-nums;
}
</style>
