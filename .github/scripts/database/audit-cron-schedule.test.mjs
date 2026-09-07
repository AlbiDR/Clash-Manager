// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from 'node:assert/strict';
import test from 'node:test';

import { auditCronSchedule, runsPerDay } from './audit-cron-schedule.mjs';

const manifest = {
  dailyBudget: 600,
  jobs: [
    { name: 'nightly-maintenance', schedule: '0 3 * * *', command: 'SELECT substrate.execute_nightly_maintenance()' },
    { name: 'voyage-auto-activate-cron', schedule: '*/15 * * * *', command: 'SELECT drivers.auto_activate_pending_voyages()' },
  ],
};
const live = [
  { jobid: 32, jobname: 'nightly-maintenance', schedule: '0 3 * * *', active: true, command: 'SELECT substrate.execute_nightly_maintenance()' },
  { jobid: 38, jobname: 'voyage-auto-activate-cron', schedule: '*/15 * * * *', active: true, command: ' SELECT drivers.auto_activate_pending_voyages(); ' },
];

test('matches when the remote agrees, tolerating whitespace and trailing semicolons', () => {
  const result = auditCronSchedule({ manifest, live });
  assert.equal(result.status, 'MATCH');
  assert.deepEqual(result.findings, []);
  assert.equal(result.budgetTotal, 97);
});

test('flags a job declared but not scheduled', () => {
  const result = auditCronSchedule({ manifest, live: [live[0]] });
  assert.equal(result.status, 'DRIFT');
  assert.ok(result.findings.some((f) => f.kind === 'MISSING' && f.name === 'voyage-auto-activate-cron'));
});

test('flags a job scheduled but never declared', () => {
  const rogue = [...live, { jobid: 99, jobname: 'rogue-cron', schedule: '* * * * *', active: true, command: 'SELECT 1' }];
  const result = auditCronSchedule({ manifest, live: rogue });
  assert.ok(result.findings.some((f) => f.kind === 'UNDECLARED' && f.name === 'rogue-cron'));
});

test('flags a cadence changed on the remote', () => {
  const drifted = [live[0], { ...live[1], schedule: '* * * * *' }];
  const result = auditCronSchedule({ manifest, live: drifted });
  const finding = result.findings.find((f) => f.kind === 'SCHEDULE_DRIFT');
  assert.ok(finding);
  assert.match(finding.detail, /manifest \*\/15 \* \* \* \*, live \* \* \* \* \*/);
});

test('flags a command changed on the remote', () => {
  const drifted = [live[0], { ...live[1], command: 'SELECT drivers.something_else()' }];
  const result = auditCronSchedule({ manifest, live: drifted });
  assert.ok(result.findings.some((f) => f.kind === 'COMMAND_DRIFT'));
});

test('flags a declared job that has been paused', () => {
  const paused = [live[0], { ...live[1], active: false }];
  const result = auditCronSchedule({ manifest, live: paused });
  assert.ok(result.findings.some((f) => f.kind === 'INACTIVE'));
});

test('rejects the 2026-09-06 configuration on budget alone, before it reaches production', () => {
  const overBudget = {
    ...manifest,
    jobs: [manifest.jobs[0], { ...manifest.jobs[1], schedule: '* * * * *' }],
  };
  const result = auditCronSchedule({ manifest: overBudget, live });
  const finding = result.findings.find((f) => f.kind === 'OVER_BUDGET');
  assert.ok(finding, 'every-minute job must breach the budget');
  assert.match(finding.detail, /1441 executions\/day declared, budget is 600/);
});

test('an uncountable cadence is reported as unknown, never silently counted as zero', () => {
  const weekly = { ...manifest, jobs: [{ name: 'weekly', schedule: '0 3 * * 1', command: 'SELECT 1' }] };
  const result = auditCronSchedule({ manifest: weekly, live: [{ jobid: 1, jobname: 'weekly', schedule: '0 3 * * 1', active: true, command: 'SELECT 1' }] });
  assert.deepEqual(result.budgetUnknown, ['weekly']);
  assert.equal(result.budgetTotal, 0);
  assert.equal(result.status, 'MATCH');
});

test('runsPerDay understands the forms this project uses, and admits what it cannot count', () => {
  assert.equal(runsPerDay('* * * * *'), 1440);
  assert.equal(runsPerDay('*/15 * * * *'), 96);
  assert.equal(runsPerDay('0,30 * * * *'), 48);
  assert.equal(runsPerDay('0 3 * * *'), 1);
  assert.equal(runsPerDay('0 3 * * 1'), null);
  assert.equal(runsPerDay('not a cron'), null);
});

test('parses both CLI JSON shapes, bare array and agent envelope', async () => {
  const { parseRows } = await import('./audit-cron-schedule.mjs');
  const row = { jobid: 1, jobname: 'a', schedule: '0 3 * * *', active: true, command: 'SELECT 1' };
  assert.deepEqual(parseRows(`Initialising login role...\n${JSON.stringify([row])}`), [row]);
  assert.deepEqual(parseRows(JSON.stringify({ boundary: 'x', rows: [row], warning: 'y' })), [row]);
  assert.throws(() => parseRows('no payload here'), /no JSON payload/);
  assert.throws(() => parseRows('{"boundary":"x"}'), /no rows array/);
});

const gated = {
  dailyBudget: 600,
  jobs: [
    { name: 'nightly-maintenance', schedule: '0 3 * * *', command: 'SELECT substrate.execute_nightly_maintenance()' },
    { name: 'voyage-auto-activate-cron', schedule: '*/5 * * * *', command: 'SELECT drivers.auto_activate_pending_voyages()', dormantWhenIdle: true },
  ],
};

test('an event-gated job resting inactive is not drift, and costs 0 at rest', () => {
  const live = [
    { jobid: 32, jobname: 'nightly-maintenance', schedule: '0 3 * * *', active: true, command: 'SELECT substrate.execute_nightly_maintenance()' },
    { jobid: 38, jobname: 'voyage-auto-activate-cron', schedule: '*/15 * * * *', active: false, command: 'SELECT drivers.auto_activate_pending_voyages()' },
  ];
  const result = auditCronSchedule({ manifest: gated, live });
  assert.equal(result.status, 'MATCH', JSON.stringify(result.findings));
  assert.equal(result.budgetTotal, 1, 'dormant job must not count at rest');
  assert.equal(result.burstTotal, 288, 'its burst cost must still be reported');
  assert.deepEqual(result.budgetDormant, [{ name: 'voyage-auto-activate-cron', perDay: 288 }]);
});

test('the exemption does not extend to the job going missing or being re-pointed', () => {
  const missing = auditCronSchedule({ manifest: gated, live: [
    { jobid: 32, jobname: 'nightly-maintenance', schedule: '0 3 * * *', active: true, command: 'SELECT substrate.execute_nightly_maintenance()' },
  ] });
  assert.ok(missing.findings.some((f) => f.kind === 'MISSING'));

  const repointed = auditCronSchedule({ manifest: gated, live: [
    { jobid: 32, jobname: 'nightly-maintenance', schedule: '0 3 * * *', active: true, command: 'SELECT substrate.execute_nightly_maintenance()' },
    { jobid: 38, jobname: 'voyage-auto-activate-cron', schedule: '*/5 * * * *', active: false, command: 'SELECT drivers.drop_everything()' },
  ] });
  assert.ok(repointed.findings.some((f) => f.kind === 'COMMAND_DRIFT'));
});
