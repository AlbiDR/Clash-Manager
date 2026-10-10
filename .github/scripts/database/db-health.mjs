#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_READS } from './verify-app-availability.mjs';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const REQUEST_TIMEOUT_MS = 25_000;
const BYTES_PER_MIB = 1024 * 1024;
const CPU_MODES = ['idle', 'iowait', 'irq', 'nice', 'softirq', 'steal', 'system', 'user'];

/** Gauges describe this scrape; counters describe host lifetime, never today's incident alone. */
export function parseResourceMetrics(source) {
  const metrics = source.split('\n').flatMap(line => {
    const match = line.match(/^(\w+)(?:\{([^}]*)\})?\s+([-+\d.eE]+|NaN|[+-]?Inf)(?:\s+\d+)?$/);
    return match ? [{ name: match[1], labels: match[2] ?? '', value: Number(match[3]) }] : [];
  });
  const gauge = name => {
    const values = metrics.filter(metric => metric.name === name);
    return values.length === 1 && Number.isFinite(values[0].value) && values[0].value >= 0 ? values[0].value : null;
  };
  const cpu = metrics.filter(metric => metric.name === 'node_cpu_seconds_total');
  const swapTotal = gauge('node_memory_SwapTotal_bytes');
  const swapFree = gauge('node_memory_SwapFree_bytes');
  const cpuSeconds = cpu.map(metric => ({
    cpu: metric.labels.match(/(?:^|,)\s*cpu="(\d+)"/)?.[1],
    mode: metric.labels.match(/(?:^|,)\s*mode="([a-z_]+)"/)?.[1],
    seconds: metric.value,
  })).sort((left, right) => `${left.cpu}/${left.mode}`.localeCompare(`${right.cpu}/${right.mode}`));
  const cpuKeys = cpuSeconds.map(metric => `${metric.cpu}/${metric.mode}`);
  const validCpu = cpuSeconds.length > 0 && cpuSeconds.every(metric => metric.cpu && metric.mode
    && Number.isFinite(metric.seconds) && metric.seconds >= 0) && new Set(cpuKeys).size === cpuKeys.length;
  const completeCpu = validCpu && cpuSeconds.every(metric => CPU_MODES.every(mode => cpuKeys.includes(`${metric.cpu}/${mode}`)));
  const totalCpuSeconds = completeCpu ? cpuSeconds.filter(metric => !['guest', 'guest_nice'].includes(metric.mode))
    .reduce((total, metric) => total + metric.seconds, 0) : 0;
  const ioWaitSeconds = cpuSeconds.filter(metric => metric.mode === 'iowait')
    .reduce((total, metric) => total + metric.seconds, 0);
  return {
    hostBootTimeSeconds: gauge('node_boot_time_seconds'),
    cpuSeconds: validCpu ? cpuSeconds : null,
    memoryBytes: gauge('node_memory_MemTotal_bytes'),
    availableMemoryBytes: gauge('node_memory_MemAvailable_bytes'),
    swapUsedBytes: swapTotal === null || swapFree === null || swapFree > swapTotal ? null : swapTotal - swapFree,
    lifetimeSwapInPages: gauge('node_vmstat_pswpin'),
    lifetimeSwapOutPages: gauge('node_vmstat_pswpout'),
    lifetimeIoWaitPercent: totalCpuSeconds > 0 ? ioWaitSeconds / totalCpuSeconds * 100 : null,
  };
}

/** Compare acquisition windows, not unrelated SQL or app-read completion times. */
export function compareResourceReports(older, newer) {
  const result = {
    status: 'UNAVAILABLE', intervalSeconds: null, intervalBoundsSeconds: null,
    ioWaitPercent: null, swapInPagesPerSecond: null, swapOutPagesPerSecond: null, issues: [],
  };
  const first = older?.resources;
  const last = newer?.resources;
  const fail = message => { result.issues.push(message); return result; };
  if (first?.status !== 'SUCCESS' || last?.status !== 'SUCCESS') return fail('Both host resource observations must be available.');
  const before = first.data;
  const after = last.data;
  const counter = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  if (!before || !after || !counter(before.hostBootTimeSeconds) || !counter(after.hostBootTimeSeconds)) {
    return fail('Host boot identity is unavailable; counter continuity cannot be established.');
  }
  if ([before.hostId, after.hostId].some(value => typeof value !== 'string' || !value.trim())) {
    return fail('Host project identity is unavailable; counter continuity cannot be established.');
  }
  if (before.hostBootTimeSeconds !== after.hostBootTimeSeconds || before.hostId !== after.hostId) {
    return fail('Host identity changed or the host restarted.');
  }
  const window = data => {
    const start = typeof data.sampleStartedAt === 'string' ? Date.parse(data.sampleStartedAt) : NaN;
    const end = typeof data.sampleCompletedAt === 'string' ? Date.parse(data.sampleCompletedAt) : NaN;
    return Number.isFinite(start) && Number.isFinite(end) && end >= start ? { start, end } : null;
  };
  const a = window(before);
  const b = window(after);
  if (!a || !b || b.start <= a.end) return fail('Resource acquisition windows are missing, overlap, or are not in increasing order.');
  result.intervalSeconds = ((b.start + b.end) - (a.start + a.end)) / 2000;
  result.intervalBoundsSeconds = { minimum: (b.start - a.end) / 1000, maximum: (b.end - a.start) / 1000 };

  const cpuMap = series => {
    if (!Array.isArray(series) || series.length === 0) return null;
    const map = new Map();
    for (const row of series) {
      if (!row || typeof row.cpu !== 'string' || !/^\d+$/.test(row.cpu)
        || typeof row.mode !== 'string' || !/^[a-z_]+$/.test(row.mode) || !counter(row.seconds)) return null;
      const key = `${row.cpu}/${row.mode}`;
      if (map.has(key)) return null;
      map.set(key, row);
    }
    return map;
  };
  const cpuBefore = cpuMap(before.cpuSeconds);
  const cpuAfter = cpuMap(after.cpuSeconds);
  if (!cpuBefore || !cpuAfter) result.issues.push('CPU counters are missing or malformed.');
  else if (cpuBefore.size !== cpuAfter.size || [...cpuBefore.keys()].some(key => !cpuAfter.has(key))) {
    result.issues.push('CPU counter series changed between observations.');
  } else if ([...cpuBefore].some(([key, row]) => cpuAfter.get(key).seconds < row.seconds)) {
    result.issues.push('CPU counters decreased; the interval cannot be compared.');
  } else if ([...cpuBefore.values()].some(row => CPU_MODES
    .some(mode => !cpuBefore.has(`${row.cpu}/${mode}`)))) {
    result.issues.push('CPU mode counters are missing for one or more CPUs.');
  } else {
    let total = 0;
    let waiting = 0;
    for (const [key, row] of cpuBefore) {
      // Linux includes guest CPU time in user/nice; including it again distorts the ratio.
      if (row.mode === 'guest' || row.mode === 'guest_nice') continue;
      const delta = cpuAfter.get(key).seconds - row.seconds;
      total += delta;
      if (row.mode === 'iowait') waiting += delta;
    }
    if (total > 0) result.ioWaitPercent = waiting / total * 100;
    else result.issues.push('CPU counters did not advance during the interval.');
  }
  for (const [source, target] of [['lifetimeSwapInPages', 'swapInPagesPerSecond'], ['lifetimeSwapOutPages', 'swapOutPagesPerSecond']]) {
    if (!counter(before[source]) || !counter(after[source])) result.issues.push(`${source} is unavailable.`);
    else if (after[source] < before[source]) result.issues.push(`${source} decreased; the counter cannot be compared.`);
    else result[target] = (after[source] - before[source]) / result.intervalSeconds;
  }
  const available = [result.ioWaitPercent, result.swapInPagesPerSecond, result.swapOutPagesPerSecond].filter(value => value !== null).length;
  result.status = available === 3 ? 'SUCCESS' : available > 0 ? 'DEGRADED' : 'UNAVAILABLE';
  return result;
}

/** Preserve degraded evidence instead of turning missing metrics or failed probes into healthy state. */
export function buildHealthReport({ observedAt, database, resources, reads }) {
  const evidence = [database, resources, ...reads];
  return {
    observedAt,
    currentStatus: evidence.every(result => result.status === 'SUCCESS') ? 'REACHABLE' : 'DEGRADED',
    database,
    resources,
    reads,
    historyStatus: database.status !== 'SUCCESS' || !database.data?.cron24h?.runs
      ? 'UNAVAILABLE'
      : database.data.cron24h.failed > 0 ? 'FAILURES_RECORDED' : 'NO_CRON_FAILURES_RECORDED',
  };
}

async function observe(label, operation) {
  const started = performance.now();
  try {
    const data = await operation();
    return { label, status: 'SUCCESS', elapsedMs: Math.round(performance.now() - started), data };
  } catch (error) {
    return { label, status: 'UNAVAILABLE', error: error instanceof Error ? error.message : 'Request failed' };
  }
}

async function request(url, init = {}) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), cache: 'no-store' });
  const body = await response.text();
  // Do not echo raw management responses: they can contain project data or credentials.
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return body;
}

export async function collectHealthReport() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) throw new Error('SUPABASE_ACCESS_TOKEN is required for read-only database diagnostics.');
  const projectRef = (await readFile(path.join(REPO_ROOT, 'Backend/supabase/.temp/project-ref'), 'utf8')).trim();
  if (!/^[a-z]{20}$/.test(projectRef)) throw new Error('Linked project ref is invalid.');
  const env = Object.fromEntries((await readFile(path.join(REPO_ROOT, 'Frontend-PWA/.env'), 'utf8'))
    .split('\n').flatMap(line => {
      const match = line.match(/^([A-Z_]+)\s*=\s*(.*?)\s*$/);
      return match ? [[match[1], match[2].replace(/^['"]|['"]$/g, '')]] : [];
    }));
  const apiUrl = env.VITE_SUPABASE_URL;
  const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!apiUrl || !publishableKey) throw new Error('The frontend Supabase URL and publishable key are required.');
  if (new URL(apiUrl).hostname !== `${projectRef}.supabase.co`) {
    throw new Error('Frontend and linked database refer to different projects.');
  }
  const managementUrl = `https://api.supabase.com/v1/projects/${projectRef}`;
  const authorization = { Authorization: `Bearer ${token}` };
  const sql = await readFile(new URL('./db-health.sql', import.meta.url), 'utf8');
  const [database, resources, ...reads] = await Promise.all([
    observe('Database diagnostics', async () => {
      const rows = JSON.parse(await request(`${managementUrl}/database/query`, {
        method: 'POST', headers: { ...authorization, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: sql, read_only: true }),
      }));
      const health = rows[0]?.health;
      if (!health?.cron24h || !health?.observedAt) throw new Error('Database diagnostics returned no health record.');
      return health;
    }),
    observe('Host resources', async () => {
      const sampleStartedAt = new Date().toISOString();
      const metrics = parseResourceMetrics(await request(`${managementUrl}/analytics/endpoints/metrics`, { headers: authorization }));
      const sampleCompletedAt = new Date().toISOString();
      if (metrics.memoryBytes === null) throw new Error('Host memory metrics are unavailable.');
      return { ...metrics, hostId: projectRef, sampleStartedAt, sampleCompletedAt };
    }),
    ...APP_READS.map(({ relation, query, requiresRows }) => observe(relation, async () => {
      const url = new URL(`/rest/v1/${relation}?${query}`, apiUrl);
      const rows = JSON.parse(await request(url, { headers: { apikey: publishableKey, 'Accept-Profile': 'features' } }));
      if (!Array.isArray(rows)) throw new Error('Data API returned an invalid payload.');
      if (requiresRows && rows.length === 0) throw new Error('Roster snapshot returned no members.');
      return { rows: rows.length };
    })),
  ]);
  return buildHealthReport({ observedAt: new Date().toISOString(), database, resources, reads });
}

export function formatHealthReport(report) {
  const lines = [`Database connection: ${report.currentStatus}`, `Observed at: ${report.observedAt}`];
  for (const read of report.reads) {
    lines.push(`${read.label}: ${read.status === 'SUCCESS' ? `${read.data.rows} rows in ${read.elapsedMs} ms` : read.error}`);
  }
  if (report.database.status === 'SUCCESS') {
    const db = report.database.data;
    lines.push(`Database: ${(db.databaseBytes / BYTES_PER_MIB).toFixed(1)} MiB; connections ${db.connections}/${db.maxConnections}`);
    if (db.sharedBuffersBytes !== undefined) {
      lines.push(`Postgres memory: ${(db.sharedBuffersBytes / BYTES_PER_MIB).toFixed(1)} MiB shared buffers; ${(db.maintenanceWorkMemoryBytes / BYTES_PER_MIB).toFixed(1)} MiB maintenance limit per worker`);
      lines.push(`Battle primary key: ${(db.battlePrimaryKeyBytes / BYTES_PER_MIB).toFixed(1)} MiB`);
    }
    lines.push(`Last ingestion: ${db.ingestion?.last_success_at ?? 'unavailable'}`);
    const cron = db.cron24h;
    lines.push(`Last 24 hours: ${cron.runs} scheduled runs; ${cron.failed} failed; ${cron.startupTimeouts} job startup timeouts`);
    if (cron.startupTimeouts) lines.push(`Startup timeout window (UTC): ${cron.firstStartupTimeout} to ${cron.lastStartupTimeout}`);
  } else lines.push(`Database diagnostics: ${report.database.error}`);
  if (report.resources.status === 'SUCCESS') {
    const metrics = report.resources.data;
    const mib = value => value === null ? 'unavailable' : `${(value / BYTES_PER_MIB).toFixed(1)} MiB`;
    lines.push(`Host RAM: ${mib(metrics.memoryBytes)} total; ${mib(metrics.availableMemoryBytes)} available; swap used ${mib(metrics.swapUsedBytes)}`);
    lines.push(`Host lifetime: ${metrics.lifetimeIoWaitPercent?.toFixed(1) ?? 'unavailable'}% CPU time waiting for disk; swapped in ${metrics.lifetimeSwapInPages ?? 'unavailable'} pages, out ${metrics.lifetimeSwapOutPages ?? 'unavailable'} pages`);
    lines.push('Swap and disk-wait counters are cumulative. High swap alone does not establish current memory pressure.');
  } else lines.push(`Host resources: ${report.resources.error}`);
  lines.push(`Recent history: ${report.historyStatus}`);
  if (report.resourceInterval) {
    const interval = report.resourceInterval;
    lines.push(`Host interval: ${interval.status}`);
    if (interval.intervalSeconds !== null) {
      lines.push(`Resource acquisition interval: ${interval.intervalSeconds.toFixed(1)} s (window bounds ${interval.intervalBoundsSeconds.minimum.toFixed(1)}–${interval.intervalBoundsSeconds.maximum.toFixed(1)} s; rates use acquisition midpoints)`);
      const rate = value => value === null ? 'unavailable' : value.toFixed(2);
      lines.push(`Interval disk wait: ${rate(interval.ioWaitPercent)}% CPU time; swap in ${rate(interval.swapInPagesPerSecond)} pages/s, out ${rate(interval.swapOutPagesPerSecond)} pages/s`);
      lines.push('Acquisition windows bound client request timing; exporter sample age is unknown. Interval activity alone does not establish an outage cause.');
    }
    for (const issue of interval.issues) lines.push(`Interval evidence: ${issue}`);
  }
  return lines.join('\n');
}

export async function runHealthCli(args, { collect = collectHealthReport, read = file => readFile(file, 'utf8') } = {}) {
  const json = args.includes('--json');
  const options = args.filter(arg => arg !== '--json');
  if (options.length && (options[0] !== '--compare' || options.length < 2 || options.length > 3
    || options.slice(1).some(arg => arg.startsWith('--')))) {
    throw new Error('Usage: db:health [--json] [--compare <older.json> [<newer.json>]]');
  }
  const older = options.length ? JSON.parse(await read(options[1])) : null;
  const report = options.length === 3 ? JSON.parse(await read(options[2])) : await collect();
  if (!report || !report.database || !report.resources || !Array.isArray(report.reads)
    || !['REACHABLE', 'DEGRADED'].includes(report.currentStatus)) throw new Error('Invalid health report.');
  const output = options.length ? { ...report, resourceInterval: compareResourceReports(older, report) } : report;
  return {
    output: json ? JSON.stringify(output, null, 2) : formatHealthReport(output),
    exitCode: report.currentStatus === 'DEGRADED' || (output.resourceInterval && output.resourceInterval.status !== 'SUCCESS') ? 1 : 0,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await runHealthCli(process.argv.slice(2));
    console.log(result.output);
    process.exitCode = result.exitCode;
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Database diagnostics failed');
    process.exitCode = 1;
  }
}
