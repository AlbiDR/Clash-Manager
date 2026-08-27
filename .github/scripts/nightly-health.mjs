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

const MIN_OBSERVATIONS_PER_HALF = 2;

// A stage "needed intervention" when it did not reach a merged pull request by
// itself. Both the rescued and the lost cases count: the whole point is that a
// rescue is not the same as not needing one.
const RESCUED_CLASSES = new Set(["RECOVERED_AFTER_NUDGE", "RECOVERED_BY_FALLBACK_PUBLISH"]);
const SELF_SUFFICIENT_STATES = new Set(["MERGED"]);

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
      const entry = ledger.runs[date][String(stageNumber)];
      return entry ? { date, needed: neededIntervention(entry), state: entry.state, failureClass: entry.failureClass } : null;
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

export function evaluatePipelineHealth(ledger, registry) {
  const stages = (registry?.stages || []).map(stage => ({
    stage: stage.number,
    slug: stage.slug,
    ...evaluateStageHealth(stageInterventionHistory(ledger, stage.number)),
  }));
  return {
    stages,
    chronic: stages.filter(s => s.verdict === HEALTH.CHRONIC),
    degrading: stages.filter(s => s.verdict === HEALTH.DEGRADING),
  };
}

export function renderHealthReport(health) {
  const { stages, chronic, degrading } = health;
  if (!stages.length) return "\nStage health: not evaluated.\n";

  const unknown = stages.filter(s => s.verdict === HEALTH.UNKNOWN).length;
  if (chronic.length === 0 && degrading.length === 0) {
    return `\nStage health: no stage is degrading (${stages.length - unknown} evaluated, ${unknown} without enough history).\n`;
  }

  const lines = ["", "Stage health: adverse trends detected across runs.", ""];
  for (const s of chronic) {
    lines.push(`- Stage ${s.stage} (${s.slug}) CHRONIC: ${s.reason}.`);
    lines.push("    It is reaching a merged result only because something rescues it every time.");
  }
  for (const s of degrading) {
    lines.push(`- Stage ${s.stage} (${s.slug}) DEGRADING: ${s.reason}.`);
  }
  lines.push("");
  lines.push("Each of these passes its individual runs, which is why no per-run check reports them.");
  lines.push("");
  return lines.join("\n");
}
