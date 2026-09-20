<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
/**
 * [SHARED UI] ANIMATED DIGITS
 *
 * A layout-stable numeric readout. Only digit cells whose value changes are
 * replaced, so a live value communicates change without turning into a noisy
 * counter. It is intentionally display-only: editable numeric controls keep
 * their native input semantics, caret behaviour, and IME support.
 */
import { computed, onMounted, ref, watch } from "vue";

const props = withDefaults(defineProps<{
  /** Display value. Separators remain visually static. */
  value: string | number;
  /** Spoken context for assistive technology. */
  label: string;
  /** Fixed semantic direction where a value is known to count down/up. */
  direction?: "auto" | "up" | "down";
}>(), {
  direction: "auto",
});

const displayValue = computed(() => String(props.value));
const displayCharacters = computed(() => [...displayValue.value]);
const resolvedDirection = ref<"up" | "down">("up");
const isMounted = ref(false);

function getNumericValue(value: string) {
  const digits = value.replace(/[^\d.-]/g, "");
  return Number(digits);
}

function isDigitCharacter(character: string) {
  return /^\d$/.test(character);
}

watch(displayValue, (nextValue, previousValue) => {
  if (!isMounted.value || props.direction !== "auto") return;

  const nextNumber = getNumericValue(nextValue);
  const previousNumber = getNumericValue(previousValue);
  if (Number.isFinite(nextNumber) && Number.isFinite(previousNumber) && nextNumber !== previousNumber) {
    resolvedDirection.value = nextNumber > previousNumber ? "up" : "down";
  }
});

onMounted(() => {
  isMounted.value = true;
});

const motionDirection = computed(() => props.direction === "auto" ? resolvedDirection.value : props.direction);
const accessibleValue = computed(() => `${props.label}: ${displayValue.value}`);
</script>

<template>
  <span class="animated-digits">
    <span class="animated-digits-accessible">{{ accessibleValue }}</span>
    <span
      class="animated-digits-visual"
      aria-hidden="true"
      :class="{
        'is-direction-up': motionDirection === 'up',
        'is-direction-down': motionDirection === 'down',
      }"
    >
      <span
        v-for="(character, index) in displayCharacters"
        :key="index"
        class="animated-digit-cell"
        :class="{ 'animated-digit-cell--separator': !isDigitCharacter(character) }"
      >
        <Transition
          v-if="isDigitCharacter(character)"
          name="animated-digit"
        >
          <span
            :key="`${index}-${character}`"
            class="animated-digit-character"
          >{{ character }}</span>
        </Transition>
        <span
          v-else
          class="animated-digit-separator"
        >{{ character }}</span>
      </span>
    </span>
  </span>
</template>

<style scoped>
.animated-digits {
  display: inline-flex;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.animated-digits-accessible {
  position: absolute;
  width: var(--sys-space-1);
  height: var(--sys-space-1);
  padding: 0;
  margin: calc(var(--sys-space-1) * -1);
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.animated-digits-visual {
  display: inline-flex;
  align-items: baseline;
}

.animated-digit-cell {
  position: relative;
  display: inline-grid;
  min-width: 0.62em;
  height: 1em;
  overflow: hidden;
  line-height: 1;
  place-items: center;
}

.animated-digit-cell--separator {
  min-width: auto;
}

.animated-digit-character,
.animated-digit-separator {
  grid-area: 1 / 1;
  line-height: inherit;
}

.animated-digit-enter-active,
.animated-digit-leave-active {
  transition:
    opacity var(--sys-motion-duration-200) var(--sys-motion-easing-decelerate),
    transform var(--sys-motion-duration-200) var(--sys-motion-easing-decelerate),
    filter var(--sys-motion-duration-200) var(--sys-motion-easing-decelerate);
}

.is-direction-up .animated-digit-enter-from,
.is-direction-down .animated-digit-leave-to {
  opacity: 0;
  filter: blur(2px);
  transform: translateY(0.72em);
}

.is-direction-up .animated-digit-leave-to,
.is-direction-down .animated-digit-enter-from {
  opacity: 0;
  filter: blur(2px);
  transform: translateY(-0.72em);
}

@media (prefers-reduced-motion: reduce) {
  .animated-digit-enter-active,
  .animated-digit-leave-active {
    transition: none;
  }
}
</style>
