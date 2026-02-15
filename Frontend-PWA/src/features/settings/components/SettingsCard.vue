import Icon from "../../../shared/ui/Icon.vue";
<script setup lang="ts">
import { ref } from "vue";
const props = defineProps<{
  title: string;
  icon: string;
  loading?: boolean;
  bodyClass?: string;
  initiallyExpanded?: boolean;
}>();

const isCollapsed = ref(!props.initiallyExpanded);

const toggleCollapse = () => {
  isCollapsed.value = !isCollapsed.value;
};
</script>

<template>
  <div
    class="settings-card"
    :class="{ collapsed: isCollapsed }"
    :aria-busy="loading ? 'true' : 'false'"
  >
    <div class="card-header" @click="toggleCollapse">
      <div class="header-main">
        <Icon :name="icon" size="20" class="header-icon" />
        <h3>{{ title }}</h3>
      </div>
      <div class="header-actions">
        <slot name="header-extra" />
        <button class="expand-btn" :class="{ rotated: !isCollapsed }">
          <Icon name="chevron_down" size="18" />
        </button>
      </div>
    </div>
    <Transition name="collapse">
      <div v-if="!isCollapsed" class="card-body" :class="bodyClass">
        <slot />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.settings-card {
  background: var(--sys-color-surface-container);
  border-radius: 24px;
  border: 1px solid var(--sys-surface-glass-border);
  overflow: hidden;
  margin: 0; /* Standardized to 0, handled by parent gap */
  transition:
    transform 0.2s var(--sys-motion-spring),
    background-color 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.25s ease;
  will-change: transform, box-shadow;
}

.settings-card:not(.collapsed) {
  background: var(--sys-color-surface-container-high);
  box-shadow: var(--sys-elevation-3);
  transform: scale(1.02); /* Retain the 'pop' without the height jump */
  border-color: rgba(var(--sys-color-primary-rgb), 0.3);
}

.card-header {
  padding: 16px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  cursor: pointer;
  user-select: none;
}

.settings-card:not(.collapsed) .card-header {
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

.header-main {
  display: flex;
  align-items: center;
  gap: 12px;
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

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.expand-btn {
  background: none;
  border: none;
  color: var(--sys-color-outline);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  cursor: pointer;
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  opacity: 0.5;
}

.expand-btn.rotated {
  transform: rotate(180deg);
  opacity: 1;
  color: var(--sys-color-primary);
}

.card-body {
  padding: 20px;
}

/* Collapse Transition */
.collapse-enter-active,
.collapse-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  max-height: 1000px;
  opacity: 1;
}

.collapse-enter-from,
.collapse-leave-to {
  max-height: 0;
  opacity: 0;
  padding-top: 0;
  padding-bottom: 0;
  overflow: hidden;
}
</style>
