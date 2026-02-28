<script setup lang="ts">
import Icon from "../../../shared/ui/Icon.vue";
import { type Inventory } from "../logic";
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

const baseUrl = import.meta.env.BASE_URL;
</script>

<template>
  <div class="vault-card glass-panel" :class="{ 'is-loading': isSimulating }">
    <h3 class="panel-header">
      <Icon name="box" size="16" />
      <span>The Vault</span>
    </h3>

    <div class="resource-grid">
      <div class="resource-row">
        <!-- Primary Resources -->
        <div class="resource-item">
          <div class="res-meta">
            <img :src="`${baseUrl}assets/game/currency-gold.webp`" class="res-asset" alt="Gold" />
            <span class="res-label">Gold</span>
          </div>
          <input 
            type="number" 
            :value="inventory.gold" 
            class="res-input"
            @input="handleInput($event, 'gold')"
          >
        </div>

        <div class="resource-item">
          <div class="res-meta">
            <img :src="`${baseUrl}assets/game/currency-gem.webp`" class="res-asset" alt="Gems" />
            <span class="res-label">Gems</span>
          </div>
          <input 
            type="number" 
            :value="inventory.gems" 
            class="res-input"
            @input="handleInput($event, 'gems')"
          >
        </div>
      </div>

      <!-- Wild Cards -->
      <div class="wildcards-section">
        <div class="section-meta">
          <span class="res-label">Wild Cards owned</span>
          <span class="res-hint">Input current Wild Cards inventory</span>
        </div>
        <div class="wildcards-row">
          <div 
            v-for="(val, rarity) in inventory.wildCards" 
            :key="rarity"
            class="wc-item"
            :class="rarity.toLowerCase()"
          >
            <img 
              :src="`${baseUrl}assets/game/wildcard-${rarity.toLowerCase()}.webp`" 
              class="wc-asset" 
              :alt="rarity" 
            />
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
  </div>
</template>

<style scoped>
.is-loading {
  opacity: 0.7;
  pointer-events: none;
}

.resource-grid {
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.resource-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.res-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.resource-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
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
  padding: 12px 14px;
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

.res-asset {
  width: 18px;
  height: 18px;
  object-fit: contain;
}

.wildcards-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-top: 16px;
  border-top: 1px solid var(--sys-color-outline-variant);
}

.section-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.res-hint {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  opacity: 0.4;
}

.wildcards-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.wc-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 50px;
}

.wc-asset {
  width: 32px;
  height: 32px;
  object-fit: contain;
  filter: drop-shadow(0 4px 8px rgba(0,0,0,0.2));
}

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
  transition: all 0.2s ease;
}

/* Rarity-specific border colors */
.wc-item.common .wc-input { border-color: rgba(165, 177, 194, 0.4); }
.wc-item.rare .wc-input { border-color: rgba(211, 84, 0, 0.4); }
.wc-item.epic .wc-input { border-color: rgba(142, 68, 173, 0.4); }
.wc-item.legendary .wc-input { border-color: rgba(0, 210, 211, 0.4); }
.wc-item.champion .wc-input { border-color: rgba(241, 196, 15, 0.5); }

.wc-item.common .wc-input:focus { border-color: #A5B1C2; box-shadow: 0 0 0 2px rgba(165, 177, 194, 0.2); }
.wc-item.rare .wc-input:focus { border-color: #D35400; box-shadow: 0 0 0 2px rgba(211, 84, 0, 0.2); }
.wc-item.epic .wc-input:focus { border-color: #8E44AD; box-shadow: 0 0 0 2px rgba(142, 68, 173, 0.2); }
.wc-item.legendary .wc-input:focus { border-color: #00D2D3; box-shadow: 0 0 0 2px rgba(0, 210, 211, 0.2); }
.wc-item.champion .wc-input:focus { border-color: #F1C40F; box-shadow: 0 0 0 2px rgba(241, 196, 15, 0.3); }

/* Hide arrows in number inputs */
input::-webkit-outer-spin-button,
input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
</style>
