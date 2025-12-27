
<script setup lang="ts">
defineProps<{
    count: number
    loading?: boolean // New prop
}>()

defineEmits<{
    (e: 'select-all'): void
    (e: 'clear'): void
    (e: 'done'): void
    (e: 'select-score', threshold: number, mode: 'ge' | 'le'): void
}>()
</script>

<template>
    <div class="selection-bar animate-pop" :aria-busy="loading ? 'true' : 'false'">
        <template v-if="loading">
            <div class="sk-text-line-m skeleton-anim" style="width: 100px;"></div>
            <div class="sel-actions">
                <div class="sk-button-s skeleton-anim"></div>
                <div class="sk-button-s skeleton-anim"></div>
                <div class="v-divider"></div>
                <div class="score-group">
                    <div class="sk-text-line-s skeleton-anim" style="width: 50px;"></div>
                    <div class="sk-button-s skeleton-anim" style="width: 30px;"></div>
                    <div class="sk-button-s skeleton-anim" style="width: 30px;"></div>
                    <div class="sk-button-s skeleton-anim" style="width: 30px;"></div>
                    <div class="sk-button-s skeleton-anim" style="width: 30px;"></div>
                </div>
                <div class="v-divider"></div>
                <div class="sk-button-s skeleton-anim"></div>
            </div>
        </template>
        <template v-else>
            <div class="sel-count">{{ count }} Selected</div>
            
            <div class="sel-actions">
                <button class="action-chip" @click="$emit('select-all')">All</button>
                <button class="action-chip" @click="$emit('clear')">None</button>
                <div class="v-divider"></div>
                <div class="score-group">
                <span class="sg-label">Score:</span>
                <button class="sg-btn" @click="$emit('select-score', 15, 'le')">≤15</button>
                <button class="sg-btn" @click="$emit('select-score', 25, 'le')">≤25</button>
                <button class="sg-btn" @click="$emit('select-score', 50, 'ge')">≥50</button>
                <button class="sg-btn" @click="$emit('select-score', 75, 'ge')">≥75</button>
                </div>
                <div class="v-divider"></div>
                <button class="action-chip danger" @click="$emit('done')">Done</button>
            </div>
        </template>
    </div>
</template>

<style scoped>
.selection-bar { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; padding-top: 8px; border-top: 1px solid var(--sys-color-outline-variant); flex-wrap: wrap; gap: 12px; }
.sel-count { font-size: 15px; font-weight: 800; color: var(--sys-color-on-surface); white-space: nowrap; }
.sel-actions { display: flex; gap: 8px; align-items: center; overflow-x: auto; padding-bottom: 2px; -webkit-overflow-scrolling: touch; }
.action-chip { background: none; border: none; font-weight: 700; cursor: pointer; padding: 6px 8px; border-radius: 8px; white-space: nowrap; font-size: 13px; color: var(--sys-color-outline); transition: all 0.2s; }
.action-chip:hover { background: var(--sys-color-surface-container-high); color: var(--sys-color-on-surface); }
.action-chip.danger { color: var(--sys-color-error); }
.action-chip.danger:hover { background: var(--sys-color-error-container); }
.v-divider { width: 1px; height: 16px; background: var(--sys-color-outline-variant); margin: 0 4px; }
.score-group { display: flex; align-items: center; gap: 2px; background: var(--sys-color-surface-container-high); padding: 2px 4px 2px 10px; border-radius: 99px; border: 1px solid transparent; }
.sg-label { font-size: 11px; font-weight: 800; color: var(--sys-color-outline); text-transform: uppercase; margin-right: 4px; }
.sg-btn { background: var(--sys-color-surface); border: 1px solid rgba(0,0,0,0.05); color: var(--sys-color-primary); font-weight: 700; font-size: 11px; padding: 4px 8px; border-radius: 12px; cursor: pointer; transition: all 0.2s var(--sys-motion-spring); }
.sg-btn:hover { transform: scale(1.05); background: var(--sys-color-primary-container); border-color: var(--sys-color-primary); }
.sg-btn:active { transform: scale(0.95); }
.animate-pop { animation: popIn 0.3s var(--sys-motion-spring); }
@keyframes popIn { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
</style>
