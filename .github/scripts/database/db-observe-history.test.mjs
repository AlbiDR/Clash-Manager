// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { completedLogWindows, MAX_CATCHUP_HOURS, mergeLogAttempts, planLogCatchup, readObserverHistory } from './db-observe-history.mjs';
import { collectProjectLogEvidence, previousCompleteUtcHour } from './db-observe-logs.mjs';

const now = Date.parse('2026-10-17T12:17:00Z');
const current = previousCompleteUtcHour(now);
function attempt(window, status = 'SUCCESS', runId = '1') {
  return { provenance: { projectRef: 'abcdefghijklmnopqrst', workflow: { runId }, checkout: { commit: 'sha' } },
    evidence: { status, window, acquisition: { startedAt: new Date(now).toISOString() } } };
}

test('catch-up chooses only completed hours within24h, oldest expiring first, and bounds additional requests', () => {
  const windows = completedLogWindows(now);
  assert.equal(windows.length, 23);
  assert.equal(windows[0].start, '2026-10-16T13:00:00.000Z');
  assert.equal(windows.at(-1).end, '2026-10-17T12:00:00.000Z');
  const plan = planLogCatchup([], now, current);
  assert.equal(plan.selected.length, MAX_CATCHUP_HOURS);
  assert.equal(plan.selected[0].start, windows[0].start);
  assert.ok(plan.selected.every(window => window.start !== current.start));
  assert.equal(completedLogWindows(Date.parse('2026-10-17T12:00:00Z')).length, 24);
});

test('successful windows deduplicate query planning while unavailable originals and successful retries remain separate', () => {
  const windows = completedLogWindows(now);
  const failed = attempt(windows[0], 'UNAVAILABLE');
  const repaired = attempt(windows[0], 'SUCCESS', '2');
  const archive = { attempts: [failed, repaired, attempt(windows[1], 'DEGRADED')] };
  const plan = planLogCatchup([archive, archive], now, current);
  assert.equal(plan.attempts.length, 3);
  assert.equal(plan.attempts[0].evidence.status, 'UNAVAILABLE');
  assert.equal(plan.selected[0].start, windows[1].start);
  assert.ok(!plan.selected.some(window => window.start === windows[0].start));
});

test('rolling history prunes expired hours and rejects malformed or partial-hour evidence', () => {
  const stale = previousCompleteUtcHour(now - 25 * 3_600_000);
  const valid = attempt(completedLogWindows(now)[0]);
  const malformed = attempt({ start: 'bad', end: current.end });
  const merged = mergeLogAttempts([{ attempts: [attempt(stale), valid, malformed] }], now);
  assert.deepEqual(merged.attempts, [valid]);
  assert.equal(merged.invalid, 1);
});

test('explicit analytics windows are exact one-hour GETs and reject expired, future and oversized windows before fetch', async () => {
  let calls = 0;
  const window = completedLogWindows(now)[0];
  const collect = selected => collectProjectLogEvidence({ projectRef: 'abcdefghijklmnopqrst', token: 'fixture', pairStartedAt: now,
    window: selected, fetchImpl: async url => { calls++; assert.equal(url.searchParams.get('iso_timestamp_start'), window.start);
      assert.equal(url.searchParams.get('iso_timestamp_end'), window.end); return { ok: false, status: 503, headers: new Headers() }; } });
  const result = await collect(window);
  assert.equal(result.status, 'UNAVAILABLE');
  assert.equal(result.window.basis, 'bounded_missing_completed_utc_hour');
  for (const invalid of [{ start: '2026-10-16T12:00:00Z', end: '2026-10-16T13:00:00Z' },
    { start: current.start, end: '2026-10-17T13:00:00Z' },
    { start: '2026-10-17T13:00:00Z', end: '2026-10-17T14:00:00Z' }]) await assert.rejects(collect(invalid), /completed UTC hour/);
  assert.equal(calls, 1);
});

test('history listing failure remains unavailable and never exposes command errors', async () => {
  const history = await readObserverHistory({ env: { GH_TOKEN: 'fixture', GITHUB_REPOSITORY: 'owner/repo' },
    execute: async () => { throw new Error('secret=fixture'); } });
  assert.equal(history.status, 'UNAVAILABLE');
  assert.doesNotMatch(JSON.stringify(history), /secret|fixture/);
});

test('artifact history retains acquisitions, reports a missing artifact and uses bounded read-only gh operations', async () => {
  const seen = [];
  const history = await readObserverHistory({ env: { GH_TOKEN: 'fixture', GITHUB_REPOSITORY: 'owner/repo' },
    execute: async (command, args, options) => {
      seen.push(args);
      assert.equal(command, 'gh');
      assert.ok(options.timeout <= 20_000);
      if (args[1] === 'list') return { stdout: JSON.stringify([{ databaseId: 1 }, { databaseId: 2 }]) };
      if (args[2] === '2') throw new Error('expired');
      const directory = args[args.indexOf('--dir') + 1];
      const folder = path.join(directory, 'db-observation-1-1');
      await mkdir(folder, { recursive: true });
      await writeFile(path.join(folder, 'db-observation.json'), JSON.stringify({ schemaVersion: 1, collector: 'db-observe',
        samples: [{ provenance: { workflow: { runId: '1' } } }], providerLogs: attempt(current).evidence,
        logArchive: { schemaVersion: 1, attempts: [attempt(completedLogWindows(now)[0], 'DEGRADED')] } }));
      return { stdout: '' };
    } });
  assert.equal(history.status, 'DEGRADED');
  assert.equal(history.archives[0].attempts.length, 2);
  assert.equal(history.archives[0].attempts[0].evidence.status, 'DEGRADED');
  assert.match(history.unknowns[0], /run 2/);
  assert.equal(seen.length, 3);
});

test('history from another or unidentified project cannot suppress current-project catch-up', () => {
  const window = completedLogWindows(now)[0];
  const other = attempt(window); other.provenance.projectRef = 'different-project';
  const unidentified = attempt(window); delete unidentified.provenance.projectRef;
  const plan = planLogCatchup([{ attempts: [other, unidentified] }], now, current, 'abcdefghijklmnopqrst');
  assert.equal(plan.projectMismatches, 2);
  assert.equal(plan.attempts.length, 0);
  assert.equal(plan.selected[0].start, window.start);
});

test('single artifact extraction directly into destination is accepted', async () => {
  const history = await readObserverHistory({ env: { GH_TOKEN: 'fixture', GITHUB_REPOSITORY: 'owner/repo' },
    execute: async (_command, args) => {
      if (args[1] === 'list') return { stdout: '[{"databaseId":7}]' };
      const directory = args[args.indexOf('--dir') + 1];
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, 'db-observation.json'), JSON.stringify({ schemaVersion: 1, collector: 'db-observe',
        samples: [{ provenance: { workflow: { runId: '7' } } }], providerLogs: attempt(current).evidence }));
      return { stdout: '' };
    } });
  assert.equal(history.status, 'SUCCESS');
  assert.equal(history.archives.length, 1);
});

test('excess rolling acquisitions are capped and truncation remains explicit', () => {
  const window = completedLogWindows(now)[0];
  const attempts = Array.from({ length: 300 }, (_, index) => attempt(window, 'UNAVAILABLE', String(index)));
  const merged = mergeLogAttempts([{ attempts }], now);
  assert.equal(merged.attempts.length, 256);
  assert.equal(merged.truncated, true);
});

test('rolling archive never recursively embeds prior archives or whole observations', () => {
  const original = attempt(completedLogWindows(now)[0]);
  original.evidence.logArchive = { attempts: [attempt(current)] };
  original.samples = ['not a log acquisition'];
  const merged = mergeLogAttempts([{ attempts: [original] }], now);
  assert.equal(merged.attempts[0].evidence.logArchive, undefined);
  assert.equal(merged.attempts[0].samples, undefined);
});
