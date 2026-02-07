<script setup lang="ts">
import { type Inventory } from "../../logic/Quartermaster/Quartermaster_Types";
import Icon from "../Icon.vue";

defineProps<{
  inventory: Inventory;
  isSimulating: boolean;
}>();

const emit = defineEmits<{
  update: [key: string, value: number];
}>();

const handleInput = (e: Event, key: string) => {
  const val = parseInt((e.target as HTMLInputElement).value) || 0;
  emit("update", key, val);
};
</script>

<template>
  <div class="vault-card glass-panel" :class="{ 'is-loading': isSimulating }">
    <h3 class="panel-header">
      <Icon name="box" size="16" />
      <span>The Vault</span>
    </h3>

    <div class="resource-grid">
      <!-- Primary Resources -->
      <div class="resource-item full">
        <div class="res-meta">
          <Icon name="donation" size="14" class="gold-icon" />
          <span class="res-label">Gold</span>
        </div>
        <input 
          type="number" 
          :value="inventory.gold" 
          class="res-input"
          @input="handleInput($event, 'gold')"
        >
      </div>

      <div class="resource-item full">
        <div class="res-meta">
          <Icon name="star" size="14" class="gem-icon" />
          <span class="res-label">Gems</span>
        </div>
        <input 
          type="number" 
          :value="inventory.gems" 
          class="res-input"
          @input="handleInput($event, 'gems')"
        >
      </div>

      <!-- Wild Cards -->
      <div class="wildcards-row">
        <div 
          v-for="(val, rarity) in inventory.wildCards" 
          :key="rarity"
          class="wc-item"
        >
          <span class="wc-rarity" :class="rarity.toLowerCase()">{{ rarity.charAt(0) }}</span>
          <input 
            type="number" 
            :value="val" 
            class="wc-input"
            @input="handleInput($event, `wc_${rarity.toLowerCase()}`)"
          >
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.glass-panel {
  background: var(--sys-surface-glass);
  backdrop-filter: var(--sys-surface-glass-blur);
  border: 1px solid var(--sys-surface-glass-border);
  border-radius: var(--shape-corner-l);
  padding: 16px;
  box-shadow: var(--sys-elevation-2);
  transition: opacity 0.3s ease;
}

.is-loading {
  opacity: 0.7;
  pointer-events: none;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 850;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  opacity: 0.7;
  margin-bottom: 20px;
}

.resource-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.resource-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.res-meta {
  display: flex;
  align-items: center;
  gap: 6px;
}

.res-label {
  font-size: 12px;
  font-weight: 700;
  opacity: 0.6;
}

.res-input {
  background: var(--sys-color-surface-container);
  border: 1px solid var(--sys-color-outline-variant);
  border-radius: 12px;
  padding: 10px 14px;
  font-family: var(--sys-font-family-mono);
  font-size: 16px;
  font-weight: 700;
  color: var(--sys-color-on-surface);
  width: 100%;
}

.res-input:focus {
  outline: none;
  border-color: var(--sys-color-primary);
  box-shadow: 0 0 0 2px rgba(var(--sys-color-primary-rgb), 0.2);
}

.gold-icon { color: #f1c40f; }
.gem-icon { color: #2ecc71; }

.wildcards-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-top: 4px;
}

.wc-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.wc-rarity {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 900;
  color: white;
  text-transform: uppercase;
}

.wc-rarity.common { background: #ced4da; color: #495057; }
.wc-rarity.rare { background: #f39c12; }
.wc-rarity.epic { background: #9b59b6; }
.wc-rarity.legendary { background: #3498db; }

.wc-input {
  background: var(--sys-color-surface-container);
  border: 1px solid var(--sys-color-outline-variant);
  border-radius: 8px;
  padding: 6px;
  font-family: var(--sys-font-family-mono);
  font-size: 12px;
  font-weight: 700;
  color: var(--sys-color-on-surface);
  width: 100%;
  text-align: center;
}

/* Hide arrows in number inputs */
input::-webkit-outer-spin-button,
input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
</style>
