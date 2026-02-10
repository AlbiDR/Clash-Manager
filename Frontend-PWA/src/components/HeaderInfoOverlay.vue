<script setup lang="ts">
import { watch } from "vue";
import { Icon } from "@shared";
import { formatHeaderDescription } from "../utils/formatters";

const props = defineProps<{
  show: boolean;
  content: string | null;
  title?: string;
}>();

const emit = defineEmits<{
  close: [];
}>();

// Lock scroll when overlay is open
watch(
  () => props.show,
  (val) => {
    if (val) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
  },
  { immediate: true },
);
</script>

<template>
  <Teleport to="body">
    <Transition name="console-expand">
      <div
        v-if="show && content"
        class="info-overlay"
        @click.self="emit('close')"
      >
        <div class="info-card-expanded glassmorphic">
          <div class="expansion-header">
            <div class="expansion-title-group">
              <Icon name="info" size="18" class="ext-icon" />
              <h3>{{ title || "Heuristic Analysis" }}</h3>
            </div>
            <button
              class="close-btn-round"
              @click="emit('close')"
              aria-label="Close"
            >
              <Icon name="close" size="20" />
            </button>
          </div>

          <div
            class="expansion-content scrollable-area"
            v-html="formatHeaderDescription(content)"
          ></div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.info-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  z-index: 2000;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 16px;
  padding-top: calc(16px + env(safe-area-inset-top));
  touch-action: none;
}

.info-card-expanded {
  width: 100%;
  max-width: var(--sys-layout-max-width);
  height: auto;
  max-height: 85vh;
  background: var(--sys-surface-glass);
  border: 1px solid var(--sys-surface-glass-border);
  border-radius: 32px;
  padding: 24px;
  box-shadow: var(--sys-elevation-4);
  display: flex;
  flex-direction: column;
  gap: 16px;
  transform-origin: top;
  position: relative;
  overflow: hidden;
}

.expansion-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.expansion-title-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.ext-icon {
  color: var(--sys-color-primary);
}

.expansion-header h3 {
  margin: 0;
  font-size: 20px;
  font-weight: 950;
  color: var(--sys-color-on-surface);
  letter-spacing: -0.03em;
}

.expansion-content {
  font-size: 15px;
  line-height: 1.7;
  color: var(--sys-color-on-surface-variant);
  overflow-y: auto;
  padding-right: 12px;
  -webkit-overflow-scrolling: touch;
  flex: 1;
  user-select: text !important;
  -webkit-user-select: text !important;
}

.expansion-content :deep(*) {
  user-select: text !important;
  -webkit-user-select: text !important;
}

.expansion-content::-webkit-scrollbar {
  width: 4px;
}
.expansion-content::-webkit-scrollbar-track {
  background: transparent;
}
.expansion-content::-webkit-scrollbar-thumb {
  background: var(--sys-color-outline-variant);
  border-radius: 10px;
}

:deep(.desc-section-title) {
  font-weight: 900;
  color: var(--sys-color-primary);
  text-transform: uppercase;
  font-size: 11px;
  letter-spacing: 0.08em;
  margin-top: 24px;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
}
:deep(.desc-section-title)::after {
  content: "";
  flex: 1;
  height: 1px;
  background: var(--sys-color-outline-variant);
  margin-left: 12px;
  opacity: 0.3;
}

:deep(.bullet-item) {
  margin-left: 4px;
  margin-bottom: 8px;
  padding-left: 20px;
  position: relative;
}
:deep(.bullet-item)::before {
  content: "→";
  position: absolute;
  left: 0;
  color: var(--sys-color-primary);
  font-weight: 900;
  opacity: 0.6;
}

:deep(.desc-list) {
  margin: 12px 0;
  padding: 0;
  list-style-type: none;
}

:deep(strong) {
  color: var(--sys-color-on-surface);
  font-weight: 850;
}

.close-btn-round {
  background: var(--sys-color-surface-container-highest);
  border: none;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--sys-color-on-surface);
  cursor: pointer;
  transition: 0.2s;
}
.close-btn-round:active {
  transform: scale(0.9);
}

.console-expand-enter-active,
.console-expand-leave-active {
  transition:
    opacity 0.4s ease,
    transform 0.4s var(--sys-motion-spring);
}
.console-expand-enter-from,
.console-expand-leave-to {
  opacity: 0;
  transform: translateY(-20px) scaleY(0.95);
}
.console-expand-enter-active .info-card-expanded {
  transition: transform 0.5s var(--sys-motion-spring);
}
.console-expand-enter-from .info-card-expanded {
  transform: translateY(-100%);
}
</style>
