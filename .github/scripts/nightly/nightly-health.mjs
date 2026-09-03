// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

// Cross-run health intelligence for the nightly pipeline.
//
// THE BLIND SPOT THIS CLOSES
// Every existing signal is single-run. A stage that needed a nudge is reported
// as RECOVERABLE and passes, which is correct for that night. But a stage that
// has needed a nudge on every single run for a week ALSO passes every night,
// because each individual run recovered. That is a pipeline steadily failing
// while reporting success, and by construction nothing in a per-run view can
// ever see it. `MAX_RECOVERY_ATTEMPTS` is per date, and ESCALATED only fires on
// consecutive NO_OUTPUT, so a stage that is rescued every time falls between
// both.
//
// WHY THERE ARE NO THRESHOLDS IN HERE
// A "fails more than N percent of the time" rule would be a magic number that
// silently becomes wrong the moment the pipeline's shape changes, and would
// need hunting down and re-tuning by hand. Instead every verdict is comparative
// and derived entirely from the data present: a stage is judged against ITS OWN
// earlier history, not against a constant someone chose once. Add stages,
// remove stages, change the cadence, run for a year: nothing here needs
// editing.
//
// The one structural minimum is that a rate needs at least two observations to
// be a rate rather than an anecdote, and a comparison needs both halves. That
// is arithmetic, not a tuning knob.
//
// The duration axis obeys the same rule. Its trend verdict is purely
// comparative, and the single absolute it uses, workBudgetMinutes, is read from
// the registry rather than chosen here: it is the deadline the pipeline already
// enforces on itself, measured from the same startEpoch the run window is, so
// comparing the two is reading back a rule that already exists rather than
// inventing a new one.

const MIN_OBSERVATIONS_PER_HALF = 2;

// A stage "needed intervention" when it did not reach a merged pull request by
// itself. Both the rescued and the lost cases count: the whole point is that a
// rescue is not the same as not needing one.
const RESCUED_CLASSES = new Set(["RECOVERED_AFTER_NUDGE", "RECOVERED_BY_FALLBACK_PUBLISH"]);
const SELF_SUFFICIENT_STATES = new Set(["MERGED"]);

// States that mean the observer never reached a verdict, NOT that the stage
// failed. EXPECTED is what ensureRunEntries seeds a row with, so a row still
// holding it is one the watchdog never got back to; RUNNING was in flight when
// the pass ended.
//
// Counting these as failures conflates "we did not look" with "it broke", and
// that is not hypothetical: on 2026-08-20 the ledger recorded 12 EXPECTED while
// eight stages had genuinely merged, evidenced by tags pr-1506 through pr-1513.
// The watchdog had failed to complete its observation pass. Treating that day
// as a pipeline collapse would blame the pipeline for the observer's blind spot
// and permanently skew every rate computed from it.
//
// They are excluded from the history entirely rather than counted either way,
// because an unknown is not evidence in either direction.
const UNOBSERVED_STATES = new Set(["EXPECTED", "RUNNING"]);

export function isObserved(entry) {
  return Boolean(entry) && !UNOBSERVED_STATES.has(entry.state);
}

export const HEALTH = {
  HEALTHY: "HEALTHY",
  DEGRADING: "DEGRADING",
  CHRONIC: "CHRONIC",
  UNKNOWN: "UNKNOWN",
};

/** Did this stage reach a merged result on its own that day? */
export function neededIntervention(entry) {
  if (!entry) return false;
  if ((entry.attempts ?? 0) > 0) return true;
  if (entry.evidence?.recovery) return true;
  if (entry.evidence?.fallbackPublish) return true;
  if (RESCUED_CLASSES.has(entry.failureClass)) return true;
  return !SELF_SUFFICIENT_STATES.has(entry.state);
}

/**
 * Ordered per-date record for one stage, oldest first. Dates come from the
 * ledger itself, so the window is however much history exists rather than a
 * fixed lookback someone has to maintain.
 */
export function stageInterventionHistory(ledger, stageNumber) {
  return Object.keys(ledger?.runs || {})
    .sort()
    .map(date => {
      const entry = ledger.runs[date]?.[String(stageNumber)];
      // Unobserved days are dropped, not scored. See UNOBSERVED_STATES.
      return isObserved(entry)
        ? { date, needed: neededIntervention(entry), state: entry.state, failureClass: entry.failureClass }
        : null;
    })
    .filter(Boolean);
}

/**
 * Compares a stage against its own past.
 *
 * CHRONIC   every run in the recent half needed rescuing. The stage is not
 *           working; it is being carried.
 * DEGRADING it needed rescuing on the latest run AND is needing it more often
 *           now than it used to.
 * HEALTHY   neither.
 * UNKNOWN   not enough history yet to say, which is reported as its own answer
 *           rather than being quietly rounded down to healthy.
 */
export function evaluateStageHealth(history) {
  const runs = history || [];
  const half = Math.floor(runs.length / 2);
  if (half < MIN_OBSERVATIONS_PER_HALF) {
    return { verdict: HEALTH.UNKNOWN, runs: runs.length, reason: "not enough recorded runs to compare" };
  }

  const earlier = runs.slice(0, runs.length - half);
  const recent = runs.slice(runs.length - half);
  const rate = window => window.filter(run => run.needed).length / window.length;
  const earlierRate = rate(earlier);
  const recentRate = rate(recent);
  const latest = runs[runs.length - 1];

  // Consecutive most-recent runs that needed rescuing. Reported alongside the
  // rates because it answers a different question: the rates say whether a
  // stage is trending worse, the streak says whether it is failing right now.
  let currentStreak = 0;
  for (let i = runs.length - 1; i >= 0 && runs[i].needed; i -= 1) currentStreak += 1;

  const base = {
    runs: runs.length,
    recentRuns: recent.length,
    recentRate,
    earlierRate,
    currentStreak,
    latestNeededIntervention: latest.needed,
  };

  // CHRONIC is the only verdict that fails a run, so it is deliberately the
  // unambiguous one: not "often" or "trending badly" but every single recent
  // run. A stage in this state is not working, it is being carried, and every
  // one of those nights still reported a pass.
  if (recent.every(run => run.needed)) {
    return { ...base, verdict: HEALTH.CHRONIC, reason: `needed intervention on all ${recent.length} most recent runs` };
  }
  // DEGRADING is informational and never fails a run. It requires the latest
  // run to have needed help AND the rate to be rising, so a stage that has
  // recovered its form is not held against its past, and a single bad night in
  // an otherwise improving trend does not raise it.
  if (latest.needed && recentRate > earlierRate) {
    return {
      ...base,
      verdict: HEALTH.DEGRADING,
      reason: `intervention rate rose from ${(earlierRate * 100).toFixed(0)}% to ${(recentRate * 100).toFixed(0)}%`,
    };
  }
  return { ...base, verdict: HEALTH.HEALTHY, reason: "no adverse trend" };
}

export const PACE = {
  STEADY: "STEADY",
  SLOWING: "SLOWING",
  OVERRUNNING: "OVERRUNNING",
  UNKNOWN: "UNKNOWN",
};

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Ordered per-date run durations for one stage, oldest first.
 *
 * Sourced from evidence.run, which the watchdog transcribes off the stage's own
 * coverage line. Rows predating that instrumentation carry no window and are
 * dropped rather than defaulted, for the same reason UNOBSERVED_STATES are: a
 * missing measurement is not a fast run.
 */
export function stageDurationHistory(ledger, stageNumber) {
  return Object.keys(ledger?.runs || {})
    .sort()
    .map(date => {
      const entry = ledger.runs[date]?.[String(stageNumber)];
      if (!isObserved(entry)) return null;
      const minutes = entry?.evidence?.run?.durationMinutes;
      return Number.isFinite(minutes) ? { date, minutes } : null;
    })
    .filter(Boolean);
}

/**
 * Compares a stage's recent pace against its own past.
 *
 * OVERRUNNING every recent run passed workBudgetMinutes. Past that point the
 *             lifecycle tells the stage to stop and submit, so a stage always
 *             over it is shipping its fallback every night instead of its work,
 *             while still reporting a normal result.
 * SLOWING     the typical recent run is now slower than the SLOWEST run this
 *             stage had ever previously recorded. Stated that way so it cannot
 *             fire on ordinary night-to-night variance: the whole recent
 *             distribution has moved past the old one.
 * STEADY      neither.
 * UNKNOWN     not enough measured runs to compare, reported rather than
 *             rounded down to fine.
 *
 * Both adverse verdicts are informational. CHRONIC remains the only verdict
 * that fails a run; a slow stage that still delivers has not failed.
 */
export function evaluateStageDuration(history, workBudgetMinutes) {
  const runs = history || [];
  const half = Math.floor(runs.length / 2);
  if (half < MIN_OBSERVATIONS_PER_HALF) {
    return { verdict: PACE.UNKNOWN, measuredRuns: runs.length, reason: "not enough measured runs to compare" };
  }

  const earlier = runs.slice(0, runs.length - half).map(run => run.minutes);
  const recent = runs.slice(runs.length - half).map(run => run.minutes);
  const recentMedian = median(recent);
  const earlierMax = Math.max(...earlier);
  const budget = Number(workBudgetMinutes);
  const overruns = Number.isFinite(budget) ? recent.filter(minutes => minutes > budget).length : 0;

  const base = {
    measuredRuns: runs.length,
    recentRuns: recent.length,
    recentMedian,
    earlierMedian: median(earlier),
    earlierMax,
    slowest: Math.max(...recent),
    overruns,
  };

  if (Number.isFinite(budget) && overruns === recent.length) {
    return { ...base, verdict: PACE.OVERRUNNING, reason: `all ${recent.length} recent runs passed the ${budget}m work budget` };
  }
  if (recentMedian > earlierMax) {
    return {
      ...base,
      verdict: PACE.SLOWING,
      reason: `typical recent run ${recentMedian}m now exceeds its slowest earlier run ${earlierMax}m`,
    };
  }
  return { ...base, verdict: PACE.STEADY, reason: "no adverse pace trend" };
}

export function evaluatePipelineHealth(ledger, registry) {
  const stages = (registry?.stages || []).map(stage => ({
    stage: stage.number,
    slug: stage.slug,
    ...evaluateStageHealth(stageInterventionHistory(ledger, stage.number)),
    // Kept on its own key: a stage can be reliable and slow, or fast and
    // carried, and collapsing the two verdicts would hide whichever came
    // second.
    pace: evaluateStageDuration(stageDurationHistory(ledger, stage.number), registry?.workBudgetMinutes),
  }));
  return {
    stages,
    chronic: stages.filter(s => s.verdict === HEALTH.CHRONIC),
    degrading: stages.filter(s => s.verdict === HEALTH.DEGRADING),
    overrunning: stages.filter(s => s.pace?.verdict === PACE.OVERRUNNING),
    slowing: stages.filter(s => s.pace?.verdict === PACE.SLOWING),
  };
}

export function renderHealthReport(health) {
  const { stages, chronic, degrading } = health;
  if (!stages.length) return "\nStage health: not evaluated.\n";

  const unknown = stages.filter(s => s.verdict === HEALTH.UNKNOWN).length;
  const overrunning = health.overrunning || [];
  const slowing = health.slowing || [];
  const unmeasured = stages.filter(s => s.pace?.verdict === PACE.UNKNOWN).length;
  const paceSummary = `${stages.length - unmeasured} stage(s) have enough measured runs to judge pace`;

  if (chronic.length === 0 && degrading.length === 0 && overrunning.length === 0 && slowing.length === 0) {
    return `\nStage health: no stage is degrading or slowing (${stages.length - unknown} evaluated, ${unknown} without enough history; ${paceSummary}).\n`;
  }

  const lines = ["", "Stage health: adverse trends detected across runs.", ""];
  for (const s of chronic) {
    lines.push(`- Stage ${s.stage} (${s.slug}) CHRONIC: ${s.reason}.`);
    lines.push("    Either something rescues it every time or it is not producing at all.");
  }
  for (const s of degrading) {
    lines.push(`- Stage ${s.stage} (${s.slug}) DEGRADING: ${s.reason}.`);
  }
  // Pace findings never fail a run; they are listed after the intervention
  // verdicts so the failing signal is never buried under an advisory one.
  for (const s of overrunning) {
    lines.push(`- Stage ${s.stage} (${s.slug}) OVERRUNNING: ${s.pace.reason}.`);
    lines.push("    Past the budget the lifecycle orders a submit, so this stage is shipping fallback work nightly.");
  }
  for (const s of slowing) {
    lines.push(`- Stage ${s.stage} (${s.slug}) SLOWING: ${s.pace.reason}.`);
  }
  lines.push("");
  // neededIntervention counts a stage that never merged, so this must not claim
  // the runs passed. They are invisible per-run because the comparison is
  // against the stage's own history, not because each night looked fine.
  lines.push("These come from comparing each stage against its own history; one run cannot show them.");
  lines.push("");
  return lines.join("\n");
}
