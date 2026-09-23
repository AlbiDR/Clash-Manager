// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { laneDurations } from './audit-duration.mjs';
import { CHECKS_FIELD, parseCoverageLine, parseCoverageLog } from './coverage-log-line.mjs';
import { calibrationForStage } from './nightly-clean-calibration.mjs';
import { buildStageExplanation } from './nightly-explain.mjs';
import { createEmptyLedger, upsertStageEntry } from './nightly-ledger.mjs';
import { parseCoverageOutcome } from './nightly-publish-fallback.mjs';
import { buildRecap, declaredCoverageRecord } from './nightly-recap.mjs';
import { finalLogLine, replaceSentinel, sentinelLine, subCheckField } from './nightly-stage.mjs';
import { buildBodyRepair, hasDanglingSentinel, parseRunWindow } from './nightly-watchdog.mjs';

const REPO_ROOT = new URL('../../../', import.meta.url);
const registry = JSON.parse(readFileSync(new URL('.github/nightly-config/stages.json', REPO_ROOT), 'utf8'));

const TIMED = '* [2026-09-09] [Stage 1] [23:17Z-23:23Z 6m] CLEAN: .github/nightly-logs/00-pr-history.md -- Audited Edge Function endpoints; zero threat vectors found';
const UNTIMED = '* [2026-09-02] [Stage 1] CLEAN: Codebase -- CLEAN calibration pass (widened candidate scan)';

test('parses the timed format introduced on 2026-09-03', () => {
  const record = parseCoverageLine(TIMED);
  assert.equal(record.date, '2026-09-09');
  assert.equal(record.stage, 1);
  assert.equal(record.status, 'CLEAN');
  assert.equal(record.target, '.github/nightly-logs/00-pr-history.md');
  assert.match(record.summary, /zero threat vectors found/);
  assert.deepEqual(record.window, { start: '23:17', end: '23:23', minutes: 6 });
});

test('parses the older untimed format and reports no window', () => {
  const record = parseCoverageLine(UNTIMED);
  assert.equal(record.date, '2026-09-02');
  // null, not 0. A line written before the timing block existed carries no
  // duration, and calling that a zero-minute audit invents a finding from a
  // format change.
  assert.equal(record.window, null);
});

test('survives a further bracketed field being added', () => {
  // The original defect was a parser pinned to the exact field count.
  const record = parseCoverageLine('* [2026-09-09] [Stage 4] [23:17Z-23:23Z 6m] [attempt 2] CHANGED: a.ts -- did a thing');
  assert.equal(record.status, 'CHANGED');
  assert.equal(record.window.minutes, 6);
});

test('reads a zero-minute window as zero, not as missing', () => {
  const record = parseCoverageLine('* [2026-09-08] [Stage 12] [10:34Z-10:35Z 0m] CLEAN: Codebase -- No UX issues found across 75 examined files');
  assert.equal(record.window.minutes, 0);
});

test('rejects lines that are not terminal records', () => {
  for (const line of [
    '',
    'not a log line',
    '* [2026-09-09] [Stage 1] IN-PROGRESS: session started',
    '* [2026-09-09] CLEAN: missing the stage marker -- x',
  ]) {
    assert.equal(parseCoverageLine(line), null, `should not parse: ${line}`);
  }
});

test('recognises every terminal status and no others', () => {
  for (const status of ['CLEAN', 'CHANGED', 'SKIPPED', 'PARTIAL-RUN']) {
    assert.equal(parseCoverageLine(`* [2026-09-09] [Stage 1] ${status}: t -- s`).status, status);
  }
  assert.equal(parseCoverageLine('* [2026-09-09] [Stage 1] BLOCKED: t -- s'), null);
});

test('filters a whole log to one stage, oldest first', () => {
  const content = [
    UNTIMED,
    '* [2026-09-05] [Stage 2] [00:10Z-00:20Z 10m] CHANGED: spec.ts -- added tests',
    TIMED,
    'noise that must be ignored',
  ].join('\n');
  const stageOne = parseCoverageLog(content, 1);
  assert.deepEqual(stageOne.map(r => r.date), ['2026-09-02', '2026-09-09']);
  assert.equal(parseCoverageLog(content, 2).length, 1);
  assert.equal(parseCoverageLog(content).length, 3, 'no stage filter returns every record');
});

test('tolerates empty and absent content', () => {
  assert.deepEqual(parseCoverageLog(''), []);
  assert.deepEqual(parseCoverageLog(null), []);
  assert.deepEqual(parseCoverageLog(undefined, 1), []);
});

test('tolerates a payload with no summary separator', () => {
  // The recap parser has always accepted this, and unifying three parsers onto
  // one must not quietly drop the most forgiving behaviour of the three. The
  // whole payload becomes the target and the summary repeats it.
  const record = parseCoverageLine('* [2026-09-09] [Stage 1] CLEAN: no summary separator');
  assert.equal(record.status, 'CLEAN');
  assert.equal(record.target, 'no summary separator');
  assert.equal(record.summary, 'no summary separator');
});

// --- The [checks ...] field ---------------------------------------------------

const CHECKED = '* [2026-09-23] [Stage 3] [01:02Z-01:09Z 7m] [checks database-verification=DB-UNAVAILABLE fold-state=DEGRADED migration-quality=PASS] CLEAN: Codebase -- fold-state: DEGRADED; database-verification: DB-UNAVAILABLE';

test('reads the checks field as a name-to-value map', () => {
  const record = parseCoverageLine(CHECKED);
  assert.deepEqual(record.checks, {
    'database-verification': 'DB-UNAVAILABLE',
    'fold-state': 'DEGRADED',
    'migration-quality': 'PASS',
  });
  assert.equal(record.status, 'CLEAN');
  assert.equal(record.target, 'Codebase');
  assert.deepEqual(record.window, { start: '01:02', end: '01:09', minutes: 7 });
});

test('a line with no checks field is unmeasured (null), never an empty map', () => {
  // {} would read as "every check was asked and none had anything to say".
  // A line written before the field existed asked nothing.
  assert.equal(parseCoverageLine(TIMED).checks, null);
  assert.equal(parseCoverageLine(UNTIMED).checks, null);
  assert.equal(parseCoverageLine('* [2026-09-09] [Stage 4] [23:17Z-23:23Z 6m] [attempt 2] CHANGED: a.ts -- x').checks, null);
});

test('a checks field quoted in the summary is not read as one', () => {
  // Only the bracket run is structured. A summary that happens to paste the
  // field must not be able to forge a status.
  const record = parseCoverageLine('* [2026-09-23] [Stage 3] CLEAN: Codebase -- saw [checks fold-state=CLEAN] in the log');
  assert.equal(record.checks, null);
  assert.equal(record.summary, 'saw [checks fold-state=CLEAN] in the log');
});

test('the checks field and the window are independent', () => {
  const untimed = parseCoverageLine('* [2026-09-23] [Stage 13] [checks audit-duration=DEGRADED] PARTIAL-RUN: Codebase -- stopped');
  assert.equal(untimed.window, null);
  assert.deepEqual(untimed.checks, { 'audit-duration': 'DEGRADED' });
  assert.equal(untimed.status, 'PARTIAL-RUN');
  assert.match(CHECKS_FIELD.source, /checks/);
});

// --- Every historical line --------------------------------------------------
//
// Read from the committed coverage logs in this checkout, and ALSO from
// origin/Nightly whenever that ref is readable (it is not in CI's shallow
// checkout, where the checkout of a Nightly push IS that ref). Each line is
// judged twice: as written, and with a checks field inserted in front of its
// status, the way finalize now writes it. The second parse must agree with the
// first on everything but `checks`. That is the property that failed on
// 2026-09-03, stated over the real corpus rather than over a hand-made
// fixture.

function historicalCorpora() {
  const corpora = [];
  const working = registry.stages
    .map(stage => new URL(stage.coverageLog, REPO_ROOT))
    .filter(url => existsSync(url))
    .map(url => readFileSync(url, 'utf8'));
  corpora.push({ source: 'working tree', content: working.join('\n') });

  const nightly = [];
  for (const stage of registry.stages) {
    const shown = spawnSync('git', ['show', `origin/Nightly:${stage.coverageLog}`], {
      cwd: new URL('.', REPO_ROOT), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    });
    if (shown.status === 0) nightly.push(shown.stdout);
  }
  if (nightly.length > 0) corpora.push({ source: 'origin/Nightly', content: nightly.join('\n') });
  return corpora;
}

test('checks is null for every historical line, and inserting one changes nothing else', () => {
  for (const { source, content } of historicalCorpora()) {
    const lines = content.split('\n').filter(line => parseCoverageLine(line));
    let legacy = 0;
    for (const line of lines) {
      // A line finalize wrote after this field shipped is not history. It is
      // judged by the round-trip tests above instead.
      if (line.includes('[checks ')) continue;
      legacy += 1;
      const record = parseCoverageLine(line);
      assert.equal(record.checks, null, `${source}: checks manufactured from ${line}`);

      const at = line.indexOf(` ${record.status}: `);
      const widened = `${line.slice(0, at)} [checks fold-state=DEGRADED]${line.slice(at)}`;
      const again = parseCoverageLine(widened);
      assert.ok(again, `${source}: a checks field made this line unparseable: ${widened}`);
      assert.deepEqual(again.checks, { 'fold-state': 'DEGRADED' });
      const { checks: _a, ...before } = record;
      const { checks: _b, ...after } = again;
      assert.deepEqual(after, before, `${source}: a checks field changed another field of ${line}`);
    }
    // Guards the guard. A corpus that could not be read would otherwise pass
    // by finding nothing. Every registered lane has written terminal records
    // since the pipeline started, so fewer records than lanes means the read
    // failed, not that history is empty.
    assert.ok(legacy >= registry.stages.length, `${source}: only ${legacy} historical records read`);
  }
});

// --- Every consumer, old line versus new line ---------------------------------
//
// One pair per shape finalize can write: each consumer is handed a log whose
// lines carry the window only (today's format) and the same log with a checks
// field added (the new format), and must return identical output. The pairs
// are built by finalLogLine itself, so this tests the bytes finalize writes,
// not a hand-typed approximation of them.

const STAGE3 = registry.stages.find(stage => stage.number === 3);
const STATUSES = { 'fold-state': 'DEGRADED', 'migration-quality': 'PASS', 'database-verification': 'DB-UNAVAILABLE' };

function logPair(dates, { stage = STAGE3, status = 'CLEAN', window = '[01:02Z-01:09Z 7m]' } = {}) {
  const lineFor = (date, checks) => finalLogLine(
    stage, status, 'fold-state: DEGRADED; database-verification: DB-UNAVAILABLE', [stage.coverageLog], date, window, checks,
  );
  return {
    before: dates.map(date => lineFor(date, null)).join('\n') + '\n',
    after: dates.map(date => lineFor(date, subCheckField(STATUSES))).join('\n') + '\n',
  };
}

const DATES = ['2026-09-20', '2026-09-21', '2026-09-22'];
const SHAPES = [
  { status: 'CLEAN', window: '[01:02Z-01:09Z 7m]' },
  { status: 'CLEAN', window: null },
  { status: 'CHANGED', window: '[01:02Z-01:19Z 17m]' },
  { status: 'PARTIAL-RUN', window: '[01:02Z-01:47Z 45m]' },
];

test('the pair really differs, so the equivalences below are not vacuous', () => {
  for (const shape of SHAPES) {
    const { before, after } = logPair(DATES, shape);
    assert.notEqual(before, after);
    assert.ok(after.includes('[checks database-verification=DB-UNAVAILABLE fold-state=DEGRADED migration-quality=PASS]'));
  }
});

test('consumer: nightly-clean-calibration reads the same streak and due state', () => {
  for (const shape of SHAPES) {
    const { before, after } = logPair(DATES, shape);
    const old = calibrationForStage(STAGE3, before);
    assert.deepEqual(calibrationForStage(STAGE3, after), old);
    assert.equal(old.lastTerminalDate, '2026-09-22', 'the calibration parser must see the records at all');
  }
});

test('consumer: audit-duration reads the same durations', () => {
  for (const shape of SHAPES) {
    const { before, after } = logPair(DATES, shape);
    const old = laneDurations(STAGE3, parseCoverageLog(before, 3));
    assert.deepEqual(laneDurations(STAGE3, parseCoverageLog(after, 3)), old);
    assert.equal(old.timedAudits + old.untimedAudits, DATES.length);
  }
});

test('consumer: nightly-publish-fallback recovers the same outcome from a patch', () => {
  for (const shape of SHAPES) {
    const { before, after } = logPair(DATES, shape);
    const patchOf = content => content.trim().split('\n').map(line => `+${line}`).join('\n');
    const old = parseCoverageOutcome(patchOf(before), STAGE3, '2026-09-22');
    assert.ok(old, 'the fallback parser must find the line at all');
    assert.deepEqual(parseCoverageOutcome(patchOf(after), STAGE3, '2026-09-22'), old);
  }
});

test('consumer: nightly-recap declaredCoverageRecord and buildRecap agree', () => {
  // This pins two things at once, and they pull in opposite directions on
  // purpose. Everything the checks field is NOT wired to must stay identical
  // (status, target, summary, window, durationMinutes; and every recap field
  // outside blindSpots). But declaredCoverageRecord.checks and the recap's
  // blindSpots ARE wired to it (nightly-blind-spots.mjs, landed alongside
  // this field so the two are never out of step), and are SUPPOSED to differ:
  // that is Layer 1 reading Layer 2's structured record instead of guessing
  // from prose, the entire reason this field exists. A blanket equality here
  // would make this test fail the moment the feature it is meant to protect
  // starts working, which is what it did until this comment was added.
  for (const shape of SHAPES) {
    const { before, after } = logPair(DATES, shape);
    const old = declaredCoverageRecord(before, 3, '2026-09-22');
    const updated = declaredCoverageRecord(after, 3, '2026-09-22');
    assert.equal(old.status, shape.status);
    assert.equal(old.checks, null, 'the unwired line carries no structured record');
    assert.deepEqual({ ...updated, checks: null }, old, 'every field but checks is untouched by the field existing');
    assert.deepEqual(updated.checks, { 'database-verification': 'DB-UNAVAILABLE', 'fold-state': 'DEGRADED', 'migration-quality': 'PASS' });

    const inputs = coverage => {
      const ledger = createEmptyLedger();
      upsertStageEntry(ledger, registry, '2026-09-22', 3, { state: 'MERGED', lastObservedAt: '2026-09-22T04:00:00.000Z' });
      return {
        ledger,
        registry,
        date: '2026-09-22',
        coverageByStage: Object.fromEntries(registry.stages.map(stage => [stage.number, stage.number === 3 ? coverage : ''])),
        prHistory: '',
        tags: ['nightly/2026-09-23/stage-2/pr-999'],
      };
    };
    const stageOf = recap => recap.stages.find(stage => stage.stage === 3);
    const beforeStage = stageOf(buildRecap(inputs(before)));
    const afterStage = stageOf(buildRecap(inputs(after)));
    assert.deepEqual({ ...afterStage, blindSpots: [] }, { ...beforeStage, blindSpots: [] }, 'nothing outside blindSpots reacts to the checks field');
    // fold-state and database-verification are both unanswered here and both
    // already readable from this fixture's prose, so the structured and
    // prose-only readings report the same two NEVER spots either way.
    // migration-quality PASS is new information only the structured reading
    // has (prose never mentions it), but PASS is answered, so it adds no
    // blind-spot item and this fixture cannot tell the two readings apart by
    // outcome. That is expected: this only proves the wiring reaches
    // blindSpots, not that every input changes it.
    assert.equal(afterStage.blindSpots.length, 2);
    assert.deepEqual(afterStage.blindSpots, beforeStage.blindSpots);

    // nightly-explain does not READ checks (no rule inspects it), but it
    // embeds the whole declaredCoverageRecord verbatim, checks included, and
    // hashes that embedding into the projection fingerprint. So the field
    // legitimately changes the explanation's `coverage.checks` and its
    // fingerprint, and nothing else: every rule's own inputs and result stay
    // byte-identical, which is what actually matters for "the same reasoning
    // ran".
    const explAfter = buildStageExplanation(inputs(after), 3);
    const explBefore = buildStageExplanation(inputs(before), 3);
    assert.notEqual(explAfter.projectionFingerprint, explBefore.projectionFingerprint, "the embedded record really did change");
    assert.deepEqual(
      { ...explAfter, coverage: { ...explAfter.coverage, checks: null }, projectionFingerprint: null },
      { ...explBefore, coverage: { ...explBefore.coverage, checks: null }, projectionFingerprint: null },
      "every rule's inputs and result are unaffected by the checks field",
    );
  }
});

test('consumer: the watchdog reads the same window, presence and body repair', () => {
  for (const shape of SHAPES) {
    const { before, after } = logPair(DATES, shape);
    // parseRunWindow is how timing reaches the ledger. It finds the line by the
    // bracket after the stage marker, then reads the window anywhere in it.
    assert.deepEqual(parseRunWindow(after, 3, '2026-09-22'), parseRunWindow(before, 3, '2026-09-22'));
    if (shape.window) assert.ok(parseRunWindow(before, 3, '2026-09-22'), 'a timed line must yield a window');
    // The presence test in the watchdog's observer is a prefix check.
    const prefix = '* [2026-09-22] [Stage 3] ';
    assert.equal(after.includes(prefix), before.includes(prefix));
    assert.equal(hasDanglingSentinel(after, 3, '2026-09-22'), false);
    // The body repair is rebuilt from the declared record.
    const repair = content => buildBodyRepair({
      stage: STAGE3,
      verdict: 'EMPTY',
      declared: declaredCoverageRecord(content, 3, '2026-09-22'),
      files: [],
      sidecar: null,
      cycleId: 'nightly-cycle/2026-09-22',
    });
    assert.deepEqual(repair(after), repair(before));
  }
});

test('consumer: finalize replaces its own sentinel with the new line', () => {
  // nightly-stage.mjs finalize, then its post-write invariant that no
  // IN-PROGRESS sentinel survives for the date.
  const sentinel = sentinelLine('2026-09-22', 3);
  const { after } = logPair(['2026-09-22']);
  const replaced = replaceSentinel(`${sentinel}\n`, sentinel, after.trim());
  assert.equal(replaced.changed, true);
  assert.equal(replaced.content, after);
  assert.ok(!replaced.content.includes('[2026-09-22] [Stage 3] IN-PROGRESS:'));
});
