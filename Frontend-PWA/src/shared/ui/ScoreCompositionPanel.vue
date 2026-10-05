<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import { computed } from "vue";
import { formatNumber } from "@core/utils/math";
import type { ScoreExplanationData } from "@core/services/useBenchmarking";

const props = defineProps<{ data: ScoreExplanationData }>();
const labels = computed<Record<string, string>>(() => ({
  current_fame: "Current war fame", average_fame: "Average war fame",
  donations: props.data.context === "lb" ? "Daily donations" : "Lifetime donations", trophies: "Trophies", participation: "War participation",
  voyage: "Voyage contribution", weighted_win_rate: "Weighted win rate",
  legacy_war_wins: "Legacy war wins", challenge_cards: "Challenge cards",
  grand_challenge: "Grand Challenge", loyalty: "Loyalty", inactivity: "Inactivity",
}));
const rawLabel = computed(() => props.data.context === "lb" ? "RPeS" : "RPoS");
const adjustments = computed(() => props.data.composition.adjustments.filter(
  term => term.key in labels.value && term.points !== 0,
));
// Presentation rounding only: displayed rows must visibly add up to the raw total.
const rounding = computed(() => Math.round(props.data.composition.rawScore) -
  [...props.data.composition.contributions, ...adjustments.value].reduce(
    (total, term) => total + Math.round(term.points), 0,
  ));
const combinedRounding = computed(() => Math.round(props.data.composition.rawScore + props.data.composition.scoreBonus)
  - Math.round(props.data.composition.rawScore) - Math.round(props.data.composition.scoreBonus));
function getPoints(points: number, signed = false) {
  const rounded = Math.round(points) || 0;
  return `${signed && rounded > 0 ? "+" : ""}${formatNumber(rounded)}`;
}
const referenceDescription = computed(() => props.data.composition.referenceScope === "clan"
  ? "Highest combined score in the clan."
  : "Highest raw score across the recruitment pool, including queued and unexpired dismissed profiles.");
</script>

<template>
  <section
    class="score-composition"
    aria-label="Score composition"
  >
    <header class="score-composition__header">
      <div class="score-composition__identity">
        <span class="score-composition__name">{{ data.name }}</span>
        <span class="score-composition__label">{{ data.context === 'lb' ? 'Performance' : 'Potential' }}</span>
      </div>
      <div class="score-composition__score">
        {{ getPoints(data.score) }}<span class="score-composition__ceiling"> / 100</span>
      </div>
    </header>

    <dl class="score-composition__terms">
      <div
        v-for="term in data.composition.contributions"
        :key="term.key"
        class="score-composition__row"
        :class="{ 'score-composition__row--zero': term.points === 0 }"
      >
        <dt>{{ labels[term.key] }}</dt><dd>{{ getPoints(term.points) }}</dd>
      </div>
    </dl>
    <dl
      v-if="adjustments.length"
      class="score-composition__terms score-composition__terms--adjustments"
    >
      <div
        v-for="term in adjustments"
        :key="term.key"
        class="score-composition__row"
      >
        <dt>{{ labels[term.key] }}</dt><dd>{{ getPoints(term.points, true) }}</dd>
      </div>
    </dl>
    <dl class="score-composition__terms score-composition__terms--total">
      <div
        v-if="rounding"
        class="score-composition__row score-composition__rounding"
      >
        <dt>Rounding</dt><dd>{{ getPoints(rounding, true) }}</dd>
      </div>
      <div class="score-composition__row score-composition__total">
        <dt>Raw score <span class="score-composition__raw-label">{{ rawLabel }}</span></dt>
        <dd>{{ getPoints(data.composition.rawScore) }} <span class="score-composition__unit">pts</span></dd>
      </div>
    </dl>

    <details class="score-composition__details">
      <summary>How this becomes {{ data.context === 'lb' ? 'PeS' : 'PoS' }}</summary>
      <div class="score-composition__explanation">
        <p v-if="data.composition.stability !== undefined">
          Historical fame, donations and war participation include
          {{ formatNumber(data.composition.stability, { style: 'percent', maximumFractionDigits: 1 }) }} attendance credit.
          Recent history carries more weight.
        </p>
        <p
          v-for="term in adjustments"
          :key="term.key"
        >
          {{ labels[term.key] }} applies a ×{{ formatNumber(term.factor ?? 1, { maximumFractionDigits: 4 }) }} multiplier.
        </p>
        <dl class="score-composition__terms">
          <div
            v-if="data.composition.scoreBonus"
            class="score-composition__row"
          >
            <dt>{{ data.context === 'lb' ? 'New member bonus' : 'Returning veteran bonus' }}</dt>
            <dd>{{ getPoints(data.composition.scoreBonus, true) }}</dd>
          </div>
          <div
            v-if="data.composition.scoreBonus && combinedRounding"
            class="score-composition__row score-composition__rounding"
          >
            <dt>Rounding</dt><dd>{{ getPoints(combinedRounding, true) }}</dd>
          </div>
          <div
            v-if="data.composition.scoreBonus"
            class="score-composition__row"
          >
            <dt>Combined score</dt><dd>{{ getPoints(data.composition.rawScore + data.composition.scoreBonus) }}</dd>
          </div>
          <div class="score-composition__row">
            <dt>{{ data.context === 'lb' ? 'Clan reference' : 'Pool reference' }}</dt>
            <dd>{{ data.composition.referenceScore === null ? 'Unavailable' : getPoints(data.composition.referenceScore) }}</dd>
          </div>
        </dl>
        <p v-if="data.composition.referenceScore !== null && data.composition.referenceScore > 0">
          {{ referenceDescription }} Your {{ data.composition.scoreBonus ? 'combined' : 'raw' }} score is divided by this reference and multiplied by 100, then rounded{{ data.context === 'hh' ? ' and capped at 100' : '' }}.
        </p>
        <p v-else>
          A positive comparison reference is not available for this score.
        </p>
        <p v-if="data.comparison">
          {{ data.context === 'lb' ? 'Clan' : 'Shortlist' }} average: {{ getPoints(data.comparison.avg) }} / 100.
        </p>
        <p class="score-composition__note">
          Your displayed score can change when the reference changes. Points are shown rounded; calculations use full precision.
        </p>
      </div>
    </details>
  </section>
</template>

<style scoped>
.score-composition { max-height: var(--score-content-max-height, none); overflow-y: auto; overscroll-behavior: contain; display: grid; gap: var(--sys-space-16); color: var(--sys-color-on-surface); }
.score-composition__header { display: flex; align-items: center; justify-content: space-between; gap: var(--sys-space-16); }
.score-composition__identity { display: grid; gap: var(--sys-space-4); min-width: 0; }
.score-composition__name { font-size: var(--sys-typescale-body-md); font-weight: 700; overflow-wrap: anywhere; }
.score-composition__raw-label, .score-composition__unit { color: var(--sys-color-on-surface-variant); font-size: var(--sys-typescale-label-sm); font-weight: 500; }
.score-composition__label { color: var(--sys-color-on-surface-variant); font-size: var(--sys-typescale-footer); }
.score-composition__score { flex-shrink: 0; font-family: var(--sys-font-family-mono); font-size: var(--sys-typescale-title-lg); font-weight: 700; }
.score-composition__ceiling { color: var(--sys-color-on-surface-variant); font-size: var(--sys-typescale-label-sm); font-weight: 500; }
.score-composition__terms { display: grid; gap: var(--sys-space-10); margin: 0; }
.score-composition__row { display: flex; align-items: baseline; justify-content: space-between; gap: var(--sys-space-16); font-size: var(--sys-typescale-body-sm); line-height: var(--sys-leading-normal); }
.score-composition__row dt { min-width: 0; }
.score-composition__row dd { margin: 0; flex-shrink: 0; font-family: var(--sys-font-family-mono); font-variant-numeric: tabular-nums; }
.score-composition__row--zero, .score-composition__rounding { color: var(--sys-color-on-surface-variant); }
.score-composition__terms--adjustments, .score-composition__terms--total { border-top: var(--sys-space-1) solid var(--sys-surface-glass-border); padding-top: var(--sys-space-12); }
.score-composition__total { font-weight: 700; }
.score-composition__raw-label { margin-left: var(--sys-space-4); }
.score-composition__details summary { display: flex; align-items: center; justify-content: space-between; min-height: var(--sys-space-48); cursor: pointer; font-size: var(--sys-typescale-body-sm); color: var(--sys-color-on-surface-variant); list-style: none; }
.score-composition__details summary::-webkit-details-marker { display: none; }
.score-composition__details summary::after { content: '+'; font-family: var(--sys-font-family-mono); font-size: var(--sys-typescale-body-md); }
.score-composition__details[open] summary::after { content: '−'; }
.score-composition__details summary:focus-visible { outline: var(--sys-space-2) solid var(--sys-color-primary); outline-offset: var(--sys-space-2); border-radius: var(--sys-shape-corner-small); }
.score-composition__explanation { display: grid; gap: var(--sys-space-12); font-size: var(--sys-typescale-body-sm); line-height: var(--sys-leading-normal); }
.score-composition__explanation p { margin: 0; }
.score-composition__note { color: var(--sys-color-on-surface-variant); }
</style>
