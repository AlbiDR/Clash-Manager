<script setup lang="ts">
import { vTactile } from "../directives/vTactile";
import { useHaptics } from "@core";

const props = defineProps<{
  version: string;
  badge?: string;
}>();

const haptics = useHaptics();

const handleReload = () => {
  haptics.heavy();
  window.location.reload();
};
</script>

<template>
  <div class="footer-info">
    <div
      class="brand"
      @click="handleReload"
      v-tactile
    >
      CLASH MANAGER V{{ version }}
      <span v-if="badge" class="demo-tag">{{ badge }}</span>
    </div>
    <div class="copy">Copyright © 2026 AlbiDR</div>
  </div>
</template>

<style scoped>
.footer-info {
  padding: 40px 0;
  text-align: center;
  user-select: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.brand {
  font-size: 12px;
  font-weight: 950;
  opacity: 0.3;
  letter-spacing: 0.1em;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  transition: opacity 0.2s;
}

.brand:active {
  opacity: 0.6;
}

.demo-tag {
  background: var(--sys-color-primary);
  color: var(--sys-color-on-primary);
  font-size: 8px;
  padding: 2px 6px;
  border-radius: 4px;
  letter-spacing: 0;
  opacity: 1;
}

.copy {
  font-size: 10px;
  opacity: 0.2;
}
</style>
