#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { mkdir, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { collectHealthReport, compareDatabaseCounters, compareResourceReports } from './db-health.mjs';
import { collectProjectLogEvidence, previousCompleteUtcHour } from './db-observe-logs.mjs';
import { MAX_CATCHUP_HOURS, mergeLogAttempts, planLogCatchup, readObserverHistory } from './db-observe-history.mjs';

const MAX_INTERVAL_SECONDS = 3600;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

export function unavailableSample(_error, observedAt, env = process.env) {
  const reason = 'SETUP_UNAVAILABLE';
  const labels = ['Database diagnostics', 'Host resources', 'roster_materialized', 'headhunter_materialized', 'recruit_blacklist_view'];
  const failed = labels.map(label => ({ label, status: 'UNAVAILABLE', sampleStartedAt: observedAt,
    sampleCompletedAt: new Date().toISOString(), errorCategory: reason, http: null }));
  return {
    schemaVersion: 1, observedAt, sampleWindow: { startedAt: observedAt, completedAt: new Date().toISOString() },
    provenance: { release: env.RELEASE_VERSION ?? env.APP_VERSION ?? env.VITE_APP_VERSION ?? null,
      projectRef: env.SUPABASE_PROJECT_REF ?? env.PROJECT_REF ?? null,
      frontendProjectHost: env.VITE_SUPABASE_URL ? (() => { try { return new URL(env.VITE_SUPABASE_URL).hostname; } catch { return null; } })() : null,
      checkout: { commit: env.GITHUB_SHA ?? env.CI_COMMIT_SHA ?? null, ref: env.GITHUB_REF ?? env.CI_COMMIT_REF_NAME ?? null },
      workflow: { runId: env.GITHUB_RUN_ID ?? null, attempt: env.GITHUB_RUN_ATTEMPT ?? null } },
    currentStatus: 'DEGRADED', historyStatus: 'UNAVAILABLE',
    databaseEvidenceStatus: 'INCOMPLETE',
    database: failed[0], resources: failed[1], reads: failed.slice(2), sampleCoverage: failed.map(item => ({
      label: item.label, status: item.status, window: { startedAt: item.sampleStartedAt, completedAt: item.sampleCompletedAt },
      http: item.http, unavailable: item.errorCategory,
    })),
    unavailableEvidence: failed.map(item => ({ label: item.label, reason: item.errorCategory })),
    evidenceCoverage: { hostResources: 'UNAVAILABLE', databaseCounters: 'UNAVAILABLE',
      snapshotPublication: 'UNAVAILABLE', pipelineHeartbeats: 'UNAVAILABLE',
      providerLogs: 'NOT_COLLECTED', providerDiskBudget: 'NOT_EXPOSED_BY_THIS_COLLECTOR' },
  };
}

function parseArgs(args) {
  const values = {};
  for (let i = 0; i < args.length; i += 1) {
    const name = args[i];
    if (!['--output', '--interval-seconds'].includes(name) || !args[i + 1] || args[i + 1].startsWith('--')) {
      throw new Error('Usage: db-observe --output <file.json> [--interval-seconds 120..3600]');
    }
    if (values[name]) throw new Error(`Duplicate option: ${name}`);
    values[name] = args[++i];
  }
  const output = values['--output'];
  const intervalSeconds = values['--interval-seconds'] === undefined ? 300 : Number(values['--interval-seconds']);
  if (!output || !Number.isInteger(intervalSeconds) || intervalSeconds < 120 || intervalSeconds > MAX_INTERVAL_SECONDS) {
    throw new Error('Usage: db-observe --output <file.json> [--interval-seconds 120..3600]');
  }
  return { output, intervalSeconds };
}

async function saveJson(outputPath, json, write = writeFile) {
  const absolute = path.resolve(outputPath);
  await mkdir(path.dirname(absolute), { recursive: true });
  const temporary = `${absolute}.${process.pid}.${randomUUID()}.tmp`;
  await write(temporary, `${JSON.stringify(json, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  await rename(temporary, absolute);
}

export async function runObserver({ output, intervalSeconds = 300 }, {
  collect = collectHealthReport, collectLogs = collectProjectLogEvidence, fetchImpl = fetch,
  wait = pause, now = () => Date.now(), save = saveJson, env = process.env, readHistory = readObserverHistory,
} = {}) {
  if (typeof output !== 'string' || !output || !Number.isInteger(intervalSeconds)
    || intervalSeconds < 120 || intervalSeconds > MAX_INTERVAL_SECONDS) throw new Error('Observer interval must be an integer from 120 to 3600 seconds and an output path is required.');
  const samples = [];
  const take = async () => {
    const started = now();
    let report;
    try { report = await collect(); } catch (error) { report = unavailableSample(error, new Date(started).toISOString(), env); }
    report.schemaVersion ??= 1;
    report.databaseEvidenceStatus ??= 'INCOMPLETE';
    report.sampleWindow ??= { startedAt: new Date(started).toISOString(), completedAt: new Date(now()).toISOString() };
    samples.push(report);
    return started;
  };
  const firstStart = await take();
  const due = firstStart + intervalSeconds * 1000;
  while (now() < due) await wait(due - now());
  await take();
  const logWindow = previousCompleteUtcHour(firstStart);
  let providerLogs;
  try {
    providerLogs = await collectLogs({
      projectRef: samples[0]?.provenance?.projectRef ?? env.SUPABASE_PROJECT_REF ?? env.PROJECT_REF,
      token: env.SUPABASE_ACCESS_TOKEN,
      pairStartedAt: firstStart,
      fetchImpl,
    });
  } catch {
    providerLogs = { status: 'UNAVAILABLE', source: 'supabase-management-analytics-logs',
      window: { ...logWindow, basis: 'previous_complete_utc_hour_at_pair_start' },
      sourceCoverage: { edge_logs: 'UNAVAILABLE', postgrest_logs: 'UNAVAILABLE', postgres_logs: 'UNAVAILABLE', function_logs: 'UNAVAILABLE' },
      aggregates: null, failedDataApiRequests: { limit: 50, records: [], truncated: false, malformedCount: 0 },
      rpcTraces: { limit: 50, records: [], truncated: false, malformedCount: 0 },
      unavailable: 'Analytics collector failed.', unknowns: ['Log evidence could not be acquired or interpreted.'] };
  }
  if (!providerLogs || !['SUCCESS', 'DEGRADED', 'UNAVAILABLE'].includes(providerLogs.status)) {
    providerLogs = { status: 'UNAVAILABLE', source: 'supabase-management-analytics-logs',
      window: { ...logWindow, basis: 'previous_complete_utc_hour_at_pair_start' },
      sourceCoverage: { edge_logs: 'UNAVAILABLE', postgrest_logs: 'UNAVAILABLE', postgres_logs: 'UNAVAILABLE', function_logs: 'UNAVAILABLE' },
      aggregates: null, failedDataApiRequests: { limit: 50, records: [], truncated: false, malformedCount: 0 },
      rpcTraces: { limit: 50, records: [], truncated: false, malformedCount: 0 },
      unavailable: 'Analytics collector returned malformed evidence.', unknowns: ['Log evidence could not be acquired or interpreted.'] };
  }
  // Artifact history stores log acquisitions only. It never turns historical
  // log coverage into historical host metrics or continuous uptime.
  let logArchive;
  if (env.GITHUB_ACTIONS === 'true') {
    const archiveNow = now();
    let history;
    try { history = await readHistory({ env }); }
    catch { history = { status: 'UNAVAILABLE', archives: [], unknowns: ['Observer artifact history acquisition failed.'] }; }
    const provenance = { ...samples[0]?.provenance, projectRef: samples[0]?.provenance?.projectRef ?? env.SUPABASE_PROJECT_REF ?? env.PROJECT_REF ?? null };
    const current = { provenance, evidence: providerLogs };
    const plan = planLogCatchup([...(history.archives ?? []), { attempts: [current] }], archiveNow, logWindow, provenance.projectRef);
    const attempts = [...plan.attempts];
    for (const window of plan.selected) {
      let evidence;
      try {
        evidence = await collectLogs({ projectRef: provenance.projectRef ?? env.SUPABASE_PROJECT_REF ?? env.PROJECT_REF,
          token: env.SUPABASE_ACCESS_TOKEN, pairStartedAt: archiveNow, window, fetchImpl });
        if (!['SUCCESS', 'DEGRADED', 'UNAVAILABLE'].includes(evidence?.status)
          || evidence?.window?.start !== window.start || evidence?.window?.end !== window.end) throw new Error('Malformed catch-up result');
      } catch {
        evidence = { status: 'UNAVAILABLE', window, unavailable: 'Catch-up analytics acquisition failed.',
          acquisition: { startedAt: new Date(now()).toISOString(), completedAt: new Date(now()).toISOString() } };
      }
      attempts.push({ provenance, evidence });
    }
    const merged = mergeLogAttempts([{ attempts }], archiveNow, provenance.projectRef);
    let omittedForSize = 0;
    // The rolling archive must stay bounded even under repeated manual runs.
    while (Buffer.byteLength(JSON.stringify(merged.attempts)) > 3 * 1024 * 1024) {
      merged.attempts.shift(); omittedForSize++;
    }
    const remaining = planLogCatchup([{ attempts: merged.attempts }], archiveNow, logWindow).missing;
    logArchive = { schemaVersion: 1, lookbackHours: 24, maximumAdditionalQueries: MAX_CATCHUP_HOURS,
      historyStatus: history.status, historyUnknowns: [...(history.unknowns ?? []), ...(plan.projectMismatches
        ? [`${plan.projectMismatches} historical acquisition(s) rejected because their project identity differs or is missing.`] : [])],
      additionalQueries: plan.selected.length, invalidHistoryAttempts: plan.invalid, rejectedProjectAttempts: plan.projectMismatches,
      historyTruncated: plan.truncated || merged.truncated || omittedForSize > 0,
      attempts: merged.attempts, missingWindows: remaining,
      status: remaining.length || history.status !== 'SUCCESS' || plan.invalid || plan.projectMismatches || plan.truncated || merged.truncated || omittedForSize
        ? 'DEGRADED' : 'SUCCESS',
      limitations: ['Only completed UTC hours starting within the last 24 hours are eligible.',
        'Missing hours older than the retention horizon cannot be recovered here.',
        'Original degraded acquisitions remain separate from later successful retries within the bounded archive.',
        'Collection success does not mean the database or ingestion work was healthy.'] };
  }
  const comparison = {
    resourceInterval: compareResourceReports(samples[0], samples[1]),
    databaseCounters: compareDatabaseCounters(samples[0], samples[1]),
    sampleStartSeparationSeconds: (Date.parse(samples[1].sampleWindow.startedAt) - Date.parse(samples[0].sampleWindow.startedAt)) / 1000,
  };
  const evidence = {
    schemaVersion: 1,
    generatedAt: new Date(now()).toISOString(),
    collector: 'db-observe',
    requestedIntervalSeconds: intervalSeconds,
    sampleCount: samples.length,
    samples,
    comparison,
    limitations: [
      'Host exporter metrics are scrape-derived; exporter sample age is not exposed by this collector.',
      'PostgreSQL counter deltas are omitted unless both observations share a non-null stats_reset epoch and the same postmaster start.',
      'Pipeline heartbeat completion and materialized snapshot publication timestamps are reported separately.',
      'Provider disk I/O budget and burst-credit metrics are not collected.',
    ],
    providerLogs,
    ...(logArchive ? { logArchive } : {}),
  };
  await save(output, evidence);
  return { evidence, exitCode: samples.some(sample => sample.currentStatus !== 'REACHABLE')
    || samples.some(sample => sample.databaseEvidenceStatus !== 'AVAILABLE')
    || comparison.resourceInterval.status !== 'SUCCESS' || providerLogs.status !== 'SUCCESS' ? 1 : 0 };
}

export async function runObserverCli(args, dependencies = {}) {
  return runObserver(parseArgs(args), dependencies);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const result = await runObserverCli(process.argv.slice(2));
    console.log(JSON.stringify({ output: path.resolve(parseArgs(process.argv.slice(2)).output),
      sampleCount: result.evidence.sampleCount, resourceStatus: result.evidence.comparison.resourceInterval.status,
      databaseCountersStatus: result.evidence.comparison.databaseCounters.status,
      databaseEvidenceStatuses: result.evidence.samples.map(sample => sample.databaseEvidenceStatus ?? 'INCOMPLETE'),
      providerLogsStatus: result.evidence.providerLogs.status }, null, 2));
    process.exitCode = result.exitCode;
  } catch {
    console.error('Observer failed (setup, usage, or output unavailable).');
    process.exitCode = 1;
  }
}
