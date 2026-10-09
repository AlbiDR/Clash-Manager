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

/** Gauges describe this scrape; counters describe host lifetime, never today's incident alone. */
export function parseResourceMetrics(source) {
  const metrics = source.split('\n').flatMap(line => {
    const match = line.match(/^(\w+)(?:\{([^}]*)\})?\s+([-+\d.eE]+)(?:\s+\d+)?$/);
    return match ? [{ name: match[1], labels: match[2] ?? '', value: Number(match[3]) }] : [];
  });
  const gauge = name => metrics.find(metric => metric.name === name)?.value ?? null;
  const cpu = metrics.filter(metric => metric.name === 'node_cpu_seconds_total');
  const totalCpuSeconds = cpu.reduce((total, metric) => total + metric.value, 0);
  const ioWaitSeconds = cpu.filter(metric => /mode="iowait"/.test(metric.labels))
    .reduce((total, metric) => total + metric.value, 0);
  const swapTotal = gauge('node_memory_SwapTotal_bytes');
  const swapFree = gauge('node_memory_SwapFree_bytes');
  return {
    memoryBytes: gauge('node_memory_MemTotal_bytes'),
    availableMemoryBytes: gauge('node_memory_MemAvailable_bytes'),
    swapUsedBytes: swapTotal === null || swapFree === null ? null : swapTotal - swapFree,
    lifetimeSwapInPages: gauge('node_vmstat_pswpin'),
    lifetimeSwapOutPages: gauge('node_vmstat_pswpout'),
    lifetimeIoWaitPercent: totalCpuSeconds > 0 ? ioWaitSeconds / totalCpuSeconds * 100 : null,
  };
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
      const metrics = parseResourceMetrics(await request(`${managementUrl}/analytics/endpoints/metrics`, { headers: authorization }));
      if (metrics.memoryBytes === null) throw new Error('Host memory metrics are unavailable.');
      return metrics;
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
  return lines.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const report = await collectHealthReport();
    console.log(process.argv.includes('--json') ? JSON.stringify(report, null, 2) : formatHealthReport(report));
    if (report.currentStatus === 'DEGRADED') process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Database diagnostics failed');
    process.exitCode = 1;
  }
}
