// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  RESOLVED_BLOCKER_KEYS,
  createEmptyLedger,
  ensureRunEntries,
  resolveEvidence,
  upsertStageEntry,
} from './nightly-ledger.mjs';
import { NIGHTLY_EVENT_SOURCES } from './nightly-events.mjs';

const registry = JSON.parse(readFileSync(new URL('../../nightly-config/stages.json', import.meta.url), 'utf8'));
const DATE = '2026-09-10';

function taggedMergedRow() {
  const ledger = createEmptyLedger();
  ensureRunEntries(ledger, registry, DATE);
  upsertStageEntry(ledger, registry, DATE, 1, {
    state: 'MERGED',
    evidence: { tag: `nightly/${DATE}/stage-1/pr-1` },
  });
  return ledger;
}

test('a tagged MERGED row still refuses demotion to a failure state', () => {
  // The corruption this guard exists to prevent (2026-08-25): the merge
  // coordinator stamped BLOCKED onto rows that carried the tag proving they
  // merged, and an eight-night clean streak read as six.
  const ledger = taggedMergedRow();
  const row = upsertStageEntry(ledger, registry, DATE, 1, {
    state: 'BLOCKED',
    failureClass: 'JULES_SESSION_STUCK',
  });
  assert.equal(row.state, 'MERGED', 'state must not be demoted');
  assert.ok(!row.failureClass, 'failureClass must not become current state');
  assert.equal(row.evidence.tag, `nightly/${DATE}/stage-1/pr-1`, 'the promotion tag is a durable fact');
});

test('the withheld classification is retained as history, not destroyed', () => {
  // Before 2026-09-10 the class was deleted outright. `attempts` and
  // evidence.recovery still showed THAT a rescue happened, but WHICH failure
  // mode was unknowable for any stage that later merged, which is nearly all
  // of them. That is the one trend a self-healing lane needs.
  const ledger = taggedMergedRow();
  const row = upsertStageEntry(ledger, registry, DATE, 1, {
    state: 'BLOCKED',
    failureClass: 'JULES_SESSION_STUCK',
  });
  assert.deepEqual(row.evidence.withheldFailureClasses, ['JULES_SESSION_STUCK']);
});

test('multiple observed classes accumulate, deduped and ordered', () => {
  const ledger = taggedMergedRow();
  upsertStageEntry(ledger, registry, DATE, 1, { state: 'BLOCKED', failureClass: 'JULES_SESSION_STUCK' });
  upsertStageEntry(ledger, registry, DATE, 1, { state: 'BLOCKED', failureClass: 'NO_PUBLISHED_OUTPUT' });
  const row = upsertStageEntry(ledger, registry, DATE, 1, { state: 'BLOCKED', failureClass: 'JULES_SESSION_STUCK' });
  assert.deepEqual(row.evidence.withheldFailureClasses, ['JULES_SESSION_STUCK', 'NO_PUBLISHED_OUTPUT']);
});

test('a later clean write does not clear the retained history', () => {
  // Guards against the key being added to RESOLVED_BLOCKER_KEYS by accident:
  // the whole point is that it survives the merge that hid the failure.
  assert.ok(
    !RESOLVED_BLOCKER_KEYS.includes('withheldFailureClasses'),
    'withheldFailureClasses must never be a resolved-blocker key',
  );
  const ledger = taggedMergedRow();
  upsertStageEntry(ledger, registry, DATE, 1, { state: 'BLOCKED', failureClass: 'JULES_SESSION_STUCK' });
  const row = upsertStageEntry(ledger, registry, DATE, 1, { state: 'MERGED' });
  assert.deepEqual(row.evidence.withheldFailureClasses, ['JULES_SESSION_STUCK']);
});

test('an untagged row is left alone so real failures still record normally', () => {
  const ledger = createEmptyLedger();
  ensureRunEntries(ledger, registry, DATE);
  const row = upsertStageEntry(ledger, registry, DATE, 2, {
    state: 'BLOCKED',
    failureClass: 'NO_PUBLISHED_OUTPUT',
  });
  assert.equal(row.state, 'BLOCKED');
  assert.equal(row.failureClass, 'NO_PUBLISHED_OUTPUT');
  assert.ok(!row.evidence.withheldFailureClasses, 'nothing is withheld when nothing was guarded');
});

// The watchdog's one restart of a FAILED session is bounded by evidence.redispatch.
// If a merge cleared it, the next pass could restart the stage a second time.
test('evidence.redispatch is durable: merging the stage never clears the restart record', () => {
  const redispatch = { failedSessionName: 'sessions/one', sessionName: 'sessions/two', ok: true };
  assert.equal(RESOLVED_BLOCKER_KEYS.includes('redispatch'), false);
  const merged = resolveEvidence({ redispatch, julesSession: { name: 'sessions/one' } }, { tag: `nightly/${DATE}/stage-3/pr-9` }, 'MERGED', null);
  assert.deepEqual(merged.redispatch, redispatch);
});

test('a restart is named as its own transition, distinct from a nudge to the old session', () => {
  const ledger = createEmptyLedger();
  ensureRunEntries(ledger, registry, DATE);
  const names = [];
  for (const redispatch of [
    { requestedAt: `${DATE}T03:00:00Z`, failedSessionName: 'sessions/one', sessionName: null, ok: null, error: null },
    { requestedAt: `${DATE}T03:00:00Z`, failedSessionName: 'sessions/one', sessionName: 'sessions/two', ok: true, error: null },
  ]) {
    upsertStageEntry(ledger, registry, DATE, 3, { state: 'ESCALATED', failureClass: 'JULES_SESSION_FAILED', evidence: { redispatch } }, { source: NIGHTLY_EVENT_SOURCES.WATCHDOG_RECOVERY });
    names.push(ledger.events.at(-1).payload.transition.name);
  }
  upsertStageEntry(ledger, registry, DATE, 4, { state: 'ESCALATED', failureClass: 'JULES_SESSION_FAILED', evidence: { redispatch: { failedSessionName: 'sessions/x', ok: false, error: 'HTTP 500' } } }, { source: NIGHTLY_EVENT_SOURCES.WATCHDOG_RECOVERY });
  names.push(ledger.events.at(-1).payload.transition.name);
  assert.deepEqual(names, ['JULES_REDISPATCH_REQUESTED', 'JULES_SESSION_REDISPATCHED', 'JULES_REDISPATCH_FAILED']);
});
