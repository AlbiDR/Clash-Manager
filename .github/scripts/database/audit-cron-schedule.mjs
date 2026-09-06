#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..', '..');
const MANIFEST_PATH = path.join(REPO_ROOT, '.github', 'nightly-config', 'cron-schedule.json');

/** Exit codes are distinct so "could not compare" can never read as "matched". */
export const EXIT = { MATCH: 0, DRIFT: 1, NOT_COMPARED: 2 };

/**
 * Executions per day for the cron forms this project actually uses.
 * Returns null when the expression uses day-of-month or day-of-week, because a
 * per-day count is not well defined there. Callers must treat null as UNKNOWN
 * rather than zero; a budget that silently counted unknowns as free would be
 * the same class of blind spot this file exists to prevent.
 */
export function runsPerDay(schedule) {
  const fields = String(schedule).trim().split(/\s+/);
  if (fields.length !== 5) return null;
  const [minute, hour, dom, month, dow] = fields;
  if (dom !== '*' || month !== '*' || dow !== '*') return null;

  const expand = (field, max) => {
    if (field === '*') return max;
    if (/^\*\/\d+$/.test(field)) {
      const step = Number(field.slice(2));
      return step > 0 ? Math.ceil(max / step) : null;
    }
    if (/^\d+(,\d+)*$/.test(field)) return field.split(',').length;
    return null;
  };

  const minutes = expand(minute, 60);
  const hours = expand(hour, 24);
  if (minutes === null || hours === null) return null;
  return minutes * hours;
}

/** Commands differ only in whitespace and trailing semicolons between environments. */
function normalizeCommand(command) {
  return String(command ?? '').replace(/\s+/g, ' ').replace(/;\s*$/, '').trim().toLowerCase();
}

/**
 * Compares declared manifest against live cron.job rows.
 * Pure: takes both sides as data so it is testable without a database.
 */
export function auditCronSchedule({ manifest, live }) {
  const findings = [];
  const declared = new Map(manifest.jobs.map((job) => [job.name, job]));
  const actual = new Map(live.map((job) => [job.jobname, job]));

  for (const [name, job] of declared) {
    const found = actual.get(name);
    if (!found) {
      findings.push({ kind: 'MISSING', name, detail: `declared but not scheduled on the remote` });
      continue;
    }
    if (found.schedule !== job.schedule) {
      findings.push({ kind: 'SCHEDULE_DRIFT', name, detail: `manifest ${job.schedule}, live ${found.schedule}` });
    }
    if (normalizeCommand(found.command) !== normalizeCommand(job.command)) {
      findings.push({ kind: 'COMMAND_DRIFT', name, detail: `manifest "${job.command}", live "${String(found.command).trim()}"` });
    }
    if (found.active === false) {
      findings.push({ kind: 'INACTIVE', name, detail: 'declared but paused on the remote' });
    }
  }

  for (const [name] of actual) {
    if (!declared.has(name)) {
      findings.push({ kind: 'UNDECLARED', name, detail: 'scheduled on the remote but absent from the manifest' });
    }
  }

  // Budget is computed from the MANIFEST, so CI catches an over-budget change at
  // review time rather than after it has been applied to production.
  let budgetTotal = 0;
  const unknown = [];
  for (const job of manifest.jobs) {
    const perDay = runsPerDay(job.schedule);
    if (perDay === null) unknown.push(job.name);
    else budgetTotal += perDay;
  }
  if (budgetTotal > manifest.dailyBudget) {
    findings.push({
      kind: 'OVER_BUDGET',
      name: '(total)',
      detail: `${budgetTotal} executions/day declared, budget is ${manifest.dailyBudget}`,
    });
  }

  return {
    status: findings.length === 0 ? 'MATCH' : 'DRIFT',
    findings,
    budgetTotal,
    budgetUnknown: unknown,
  };
}

async function readLiveJobs() {
  // The Supabase project lives under Backend/, and deploy-supabase.yml runs
  // `supabase link` from there, so that is where the link state is written.
  // Falls back to the repo root for a local link made from the top level.
  const candidates = [path.join(REPO_ROOT, 'Backend'), REPO_ROOT];
  let stdout = null;
  let lastError = null;
  for (const cwd of candidates) {
    try {
      ({ stdout } = await run(
        'supabase',
        [
          'db', 'query', '--linked',
          // Explicit format: the CLI emits agent-wrapped JSON when it detects an
          // agent and a human-readable table otherwise, so relying on the default
          // worked locally and produced an unparseable table in CI.
          '--output-format', 'json',
          'select jobid, jobname, schedule, active, command from cron.job order by jobid',
        ],
        { cwd, maxBuffer: 8 * 1024 * 1024 },
      ));
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (stdout === null) throw lastError ?? new Error('no linked Supabase project found');
  return parseRows(stdout);
}

/**
 * The CLI has two JSON shapes: a bare array, and an agent envelope with the rows
 * under `rows`. Both appear depending on whether it thinks it is talking to an
 * agent, which is why this is a named, tested function rather than an inline regex.
 */
export function parseRows(stdout) {
  const start = stdout.search(/[[{]/);
  if (start === -1) throw new Error('no JSON payload in supabase db query output');
  const payload = JSON.parse(stdout.slice(start));
  const rows = Array.isArray(payload) ? payload : payload.rows;
  if (!Array.isArray(rows)) throw new Error('payload contained no rows array');
  return rows;
}

async function main() {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));

  let live;
  try {
    live = await readLiveJobs();
  } catch (error) {
    // [THREAT:] A skipped comparison that exits 0 is indistinguishable from a
    // clean one. Exit 2 keeps "not compared" its own outcome.
    console.error('[NOT COMPARED] could not read cron.job from the remote:', error.message);
    console.error('[NOT COMPARED] manifest declares', manifest.jobs.length, 'jobs; live state unknown.');
    process.exit(EXIT.NOT_COMPARED);
  }

  const result = auditCronSchedule({ manifest, live });
  console.log(`[BUDGET] ${result.budgetTotal} executions/day declared, ceiling ${manifest.dailyBudget}`);
  if (result.budgetUnknown.length > 0) {
    console.log(`[BUDGET] not counted (day-of-week or day-of-month): ${result.budgetUnknown.join(', ')}`);
  }

  if (result.status === 'MATCH') {
    console.log(`[PASS] all ${manifest.jobs.length} declared cron jobs match the remote.`);
    process.exit(EXIT.MATCH);
  }

  for (const finding of result.findings) {
    console.error(`[${finding.kind}] ${finding.name}: ${finding.detail}`);
  }
  console.error(`[FAIL] ${result.findings.length} cron schedule finding(s).`);
  process.exit(EXIT.DRIFT);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
