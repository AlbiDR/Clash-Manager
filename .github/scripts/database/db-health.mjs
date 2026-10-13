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
const ERROR_CATEGORIES = new Set(['FETCH_REJECTED', 'BODY_READ_FAILED', 'JSON_PARSE_FAILED', 'HTTP_ERROR', 'REQUEST_FAILED', 'SETUP_UNAVAILABLE']);
const SNAPSHOT_NAMES = ['roster', 'headhunter'];
const HEARTBEAT_COMPONENTS = ['ROYALE_DATA_INGESTOR', 'HEADHUNTER_SCANNER'];
const DATABASE_COUNTER_KEYS = ['numBackends', 'xactCommit', 'xactRollback', 'blocksRead', 'blocksHit', 'tempFiles', 'tempBytes', 'deadlocks'];

function safeHttp(value) {
  if (!value || !Number.isInteger(value.status) || value.status < 100 || value.status > 599) return null;
  const requestId = typeof value.requestId === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value.requestId)
    ? value.requestId : null;
  return { status: value.status, requestId };
}
function failureLabel(result) {
  if (result?.errorCategory === 'HTTP_ERROR') {
    const http = safeHttp(result.http);
    return http ? `HTTP ${http.status}` : 'HTTP_ERROR';
  }
  if (ERROR_CATEGORIES.has(result?.errorCategory)) return result.errorCategory;
  const http = safeHttp(result?.http);
  return http ? `HTTP ${http.status}` : 'REQUEST_FAILED';
}

/** Gauges describe this scrape; counters describe host lifetime, never today's incident alone. */
export function parseResourceMetrics(source) {
  const metrics = source.split('\n').flatMap(line => {
    const match = line.match(/^(\w+)(?:\{([^}]*)\})?\s+([-+\d.eE]+|NaN|[+-]?Inf)(?:\s+\d+)?$/);
    return match ? [{ name: match[1], labels: match[2] ?? '', value: Number(match[3]) }] : [];
  });
  const gauge = (name, matchesLabels = () => true) => {
    const values = metrics.filter(metric => metric.name === name && matchesLabels(metric.labels));
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
    postgresProcessStartTimeSeconds: gauge('process_start_time_seconds', labels => /(?:^|,)\s*service_type="postgresql"(?:,|$)/.test(labels)),
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
    status: 'UNAVAILABLE', identitySource: null, intervalSeconds: null, intervalBoundsSeconds: null,
    ioWaitPercent: null, swapInPagesPerSecond: null, swapOutPagesPerSecond: null, issues: [],
  };
  const first = older?.resources;
  const last = newer?.resources;
  const fail = message => { result.issues.push(message); return result; };
  if (first?.status !== 'SUCCESS' || last?.status !== 'SUCCESS') return fail('Both host resource observations must be available.');
  const before = first.data;
  const after = last.data;
  const counter = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  if (!before || !after) return fail('Host resource data is unavailable.');
  if ([before.hostId, after.hostId].some(value => typeof value !== 'string' || !value.trim())) {
    return fail('Host project identity is unavailable; counter continuity cannot be established.');
  }
  if (before.hostId !== after.hostId) return fail('Host project identity changed.');
  const identity = counter(before.hostBootTimeSeconds) && counter(after.hostBootTimeSeconds)
    ? 'hostBootTimeSeconds' : 'postgresProcessStartTimeSeconds';
  result.identitySource = identity === 'hostBootTimeSeconds' ? 'HOST_BOOT_TIME' : 'POSTGRES_PROCESS_START_TIME';
  if (!counter(before[identity]) || !counter(after[identity])) {
    result.identitySource = null;
    return fail('Host boot and PostgreSQL process-start continuity evidence are unavailable.');
  }
  if (before[identity] !== after[identity]) return fail(identity === 'hostBootTimeSeconds'
    ? 'Host boot identity changed; the host restarted.'
    : 'PostgreSQL process-start identity changed; process or host continuity cannot be established.');
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

/** Publication time and worker heartbeat are different freshness signals. */
export function buildFreshnessEvidence(observedAt, publication, heartbeats) {
  const observed = Date.parse(observedAt);
  const age = value => {
    if (!Number.isFinite(observed) || typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return null;
    const seconds = (observed - Date.parse(value)) / 1000;
    return seconds >= 0 ? seconds : null;
  };
  return {
    publication: Array.isArray(publication) ? publication.map(item => ({
      snapshotName: item.snapshotName ?? null, generation: item.generation ?? null,
      refreshedAt: item.refreshedAt ?? null,
      ageSeconds: age(item.refreshedAt),
      status: !item.refreshedAt ? 'NEVER_PUBLISHED' : age(item.refreshedAt) === null ? 'AGE_UNAVAILABLE' : 'PUBLISHED',
    })) : null,
    heartbeats: Array.isArray(heartbeats) ? heartbeats.map(item => ({
      componentId: item.component_id ?? null, status: item.status ?? null,
      lastSuccessAt: item.last_success_at ?? null, lastTriggeredAt: item.last_triggered_at ?? null,
      lastFailureAt: item.last_failure_at ?? null,
      lastSuccessAgeSeconds: age(item.last_success_at),
      lastTriggeredAgeSeconds: age(item.last_triggered_at),
      lastFailureAgeSeconds: age(item.last_failure_at),
    })) : null,
  };
}

/** Only derive DB counter deltas when PostgreSQL exposes an explicit shared reset epoch. */
export function compareDatabaseCounters(older, newer) {
  const result = { status: 'UNAVAILABLE', resetQualified: false, counters: {}, issues: [] };
  const a = older?.database?.data?.databaseStats;
  const b = newer?.database?.data?.databaseStats;
  const fail = issue => { result.issues.push(issue); return result; };
  if (!a || !b) return fail('Database counter snapshot missing.');
  if (older.database.data.postmasterStart !== newer.database.data.postmasterStart) return fail('PostgreSQL postmaster start changed.');
  if (!a.statsReset || a.statsReset !== b.statsReset) return fail('A shared non-null stats_reset epoch is required.');
  result.resetQualified = true;
  for (const key of ['xactCommit', 'xactRollback', 'blocksRead', 'blocksHit', 'tempFiles', 'tempBytes', 'deadlocks']) {
    if (!Number.isSafeInteger(a[key]) || !Number.isSafeInteger(b[key]) || a[key] < 0 || b[key] < a[key]) {
      result.issues.push(`${key} is missing, invalid, or decreased.`);
      continue;
    }
    result.counters[key] = b[key] - a[key];
  }
  result.status = Object.keys(result.counters).length === 7 ? 'SUCCESS'
    : Object.keys(result.counters).length ? 'DEGRADED' : 'UNAVAILABLE';
  return result;
}

function isRecord(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function hasOwn(value, key) { return isRecord(value) && Object.hasOwn(value, key); }
function validTimestampOrNull(value) {
  return value === null || (typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/i.test(value) && Number.isFinite(Date.parse(value)));
}
function validSafeStage(value) { return typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(value); }
function validStageList(value) { return Array.isArray(value) && value.every(validSafeStage); }
function validIntegrityList(value) {
  return Array.isArray(value) && value.every(item => isRecord(item) && validSafeStage(item.stage) && typeof item.passed === 'boolean');
}
function validHeartbeatRecord(heartbeat, expectedComponent = null) {
  return isRecord(heartbeat) && HEARTBEAT_COMPONENTS.includes(heartbeat.component_id)
    && (expectedComponent === null || heartbeat.component_id === expectedComponent)
    && typeof heartbeat.status === 'string' && ['IDLE', 'RUNNING', 'COMPLETED', 'FAILED'].includes(heartbeat.status)
    && ['last_success_at', 'last_triggered_at', 'last_failure_at'].every(key => hasOwn(heartbeat, key) && validTimestampOrNull(heartbeat[key]))
    && typeof heartbeat.is_data_perfect === 'boolean'
    && validStageList(heartbeat.stages_called) && validStageList(heartbeat.stages_run)
    && validIntegrityList(heartbeat.integrity_checks);
}

export function validateDatabaseMetadata(health) {
  const markers = health?.snapshotPublication;
  const markerMap = new Map();
  let snapshotPublication = Array.isArray(markers) && markers.length > 0;
  if (snapshotPublication) for (const marker of markers) {
    if (!isRecord(marker) || !SNAPSHOT_NAMES.includes(marker.snapshotName) || markerMap.has(marker.snapshotName)
      || !Number.isSafeInteger(marker.generation) || marker.generation < 0
      || !hasOwn(marker, 'refreshedAt') || !validTimestampOrNull(marker.refreshedAt)) snapshotPublication = false;
    else markerMap.set(marker.snapshotName, marker);
  }
  snapshotPublication &&= SNAPSHOT_NAMES.every(name => markerMap.has(name));

  const stats = health?.databaseStats;
  const databaseCounters = isRecord(stats) && hasOwn(stats, 'statsReset')
    && (stats.statsReset === null || (typeof stats.statsReset === 'string' && validTimestampOrNull(stats.statsReset)))
    && DATABASE_COUNTER_KEYS.every(key => Number.isSafeInteger(stats[key]) && stats[key] >= 0);

  const heartbeats = health?.heartbeats;
  const heartbeatMap = new Map();
  let pipelineHeartbeats = Array.isArray(heartbeats) && heartbeats.length > 0;
  if (pipelineHeartbeats) for (const heartbeat of heartbeats) {
    if (!validHeartbeatRecord(heartbeat) || heartbeatMap.has(heartbeat.component_id)) pipelineHeartbeats = false;
    else heartbeatMap.set(heartbeat.component_id, heartbeat);
  }
  pipelineHeartbeats &&= HEARTBEAT_COMPONENTS.every(name => heartbeatMap.has(name));
  const ingestion = health?.ingestion;
  const ingestionPresent = validHeartbeatRecord(ingestion, HEARTBEAT_COMPONENTS[0])
    && heartbeatMap.has(HEARTBEAT_COMPONENTS[0]);
  pipelineHeartbeats &&= ingestionPresent;
  return { databaseCounters, snapshotPublication, pipelineHeartbeats };
}

function sanitizeHealthPayload(health) {
  const keys = ['observedAt', 'postmasterStart', 'databaseBytes', 'connections', 'maxConnections',
    'sharedBuffersBytes', 'maintenanceWorkMemoryBytes', 'battlePrimaryKeyBytes', 'ingestion', 'heartbeats',
    'snapshotPublication', 'databaseStats', 'cron24h', 'activeQueries'];
  const safe = Object.fromEntries(keys.filter(key => hasOwn(health, key)).map(key => [key, health[key]]));
  const heartbeatKeys = ['component_id', 'status', 'last_success_at', 'last_triggered_at', 'last_failure_at',
    'is_data_perfect', 'stages_called', 'stages_run'];
  const sanitizeHeartbeat = item => {
    if (!isRecord(item)) return null;
    const heartbeat = Object.fromEntries(heartbeatKeys.filter(key => hasOwn(item, key)).map(key => [key, item[key]]));
    heartbeat.component_id = HEARTBEAT_COMPONENTS.includes(item.component_id) ? item.component_id : 'OTHER_COMPONENT';
    heartbeat.status = ['IDLE', 'RUNNING', 'COMPLETED', 'FAILED'].includes(item.status) ? item.status : 'UNKNOWN';
    for (const key of ['last_success_at', 'last_triggered_at', 'last_failure_at']) {
      if (hasOwn(heartbeat, key) && !validTimestampOrNull(heartbeat[key])) heartbeat[key] = null;
    }
    if (hasOwn(heartbeat, 'is_data_perfect') && typeof heartbeat.is_data_perfect !== 'boolean') heartbeat.is_data_perfect = null;
    for (const key of ['stages_called', 'stages_run']) {
      if (Array.isArray(item[key])) heartbeat[key] = item[key].filter(validSafeStage);
      else if (hasOwn(item, key)) heartbeat[key] = [];
    }
    if (Array.isArray(item.integrity_checks)) heartbeat.integrity_checks = item.integrity_checks.flatMap(check =>
      isRecord(check) && validSafeStage(check.stage) && typeof check.passed === 'boolean'
        ? [{ stage: check.stage, passed: check.passed }] : []);
    else if (hasOwn(item, 'integrity_checks')) heartbeat.integrity_checks = [];
    return heartbeat;
  };
  if (hasOwn(safe, 'ingestion')) safe.ingestion = sanitizeHeartbeat(safe.ingestion);
  if (Array.isArray(safe.heartbeats)) safe.heartbeats = safe.heartbeats.map(sanitizeHeartbeat);
  if (Array.isArray(safe.snapshotPublication)) safe.snapshotPublication = safe.snapshotPublication.flatMap(item =>
    isRecord(item) ? [{ snapshotName: SNAPSHOT_NAMES.includes(item.snapshotName) ? item.snapshotName : 'OTHER_SNAPSHOT',
      generation: Number.isSafeInteger(item.generation) && item.generation >= 0 ? item.generation : null,
      refreshedAt: validTimestampOrNull(item.refreshedAt) ? item.refreshedAt : null }] : []);
  if (isRecord(safe.databaseStats) && typeof safe.databaseStats.statsReset === 'string'
    && !validTimestampOrNull(safe.databaseStats.statsReset)) safe.databaseStats.statsReset = null;
  if (isRecord(safe.databaseStats)) {
    safe.databaseStats = Object.fromEntries(['statsReset', ...DATABASE_COUNTER_KEYS]
      .filter(key => hasOwn(safe.databaseStats, key)).map(key => [key, safe.databaseStats[key]]));
    if (safe.databaseStats.statsReset !== null && !validTimestampOrNull(safe.databaseStats.statsReset)) safe.databaseStats.statsReset = null;
    for (const key of DATABASE_COUNTER_KEYS) if (hasOwn(safe.databaseStats, key)
      && (!Number.isSafeInteger(safe.databaseStats[key]) || safe.databaseStats[key] < 0)) safe.databaseStats[key] = null;
  }
  if (isRecord(safe.cron24h)) safe.cron24h = Object.fromEntries(
    ['runs', 'failed', 'startupTimeouts', 'firstStartupTimeout', 'lastStartupTimeout']
      .filter(key => hasOwn(safe.cron24h, key)).map(key => [key, safe.cron24h[key]]));
  if (Array.isArray(safe.activeQueries)) safe.activeQueries = safe.activeQueries.flatMap(item =>
    isRecord(item) ? [Object.fromEntries(['state', 'waitType', 'wait', 'seconds']
      .filter(key => hasOwn(item, key)).map(key => [key, item[key]]))] : []);
  return safe;
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
  const sampleStartedAt = new Date().toISOString();
  try {
    const result = await operation();
    return { label, status: 'SUCCESS', sampleStartedAt, sampleCompletedAt: new Date().toISOString(),
      elapsedMs: Math.round(performance.now() - started), http: result.http, data: result.data,
      metadataCoverage: result.metadataCoverage };
  } catch (error) {
    return { label, status: 'UNAVAILABLE', sampleStartedAt, sampleCompletedAt: new Date().toISOString(),
      elapsedMs: Math.round(performance.now() - started), http: safeHttp(error?.http),
      errorCategory: ERROR_CATEGORIES.has(error?.category) ? error.category : 'REQUEST_FAILED' };
  }
}

async function request(url, init = {}, fetchImpl = fetch) {
  let response;
  try { response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), cache: 'no-store' }); }
  catch { throw Object.assign(new Error(), { category: 'FETCH_REJECTED' }); }
  const requestId = ['sb-request-id', 'x-request-id', 'x-kong-request-id', 'cf-ray']
    .map(name => response.headers.get(name)).find(value => value && /^[A-Za-z0-9._:-]{1,128}$/.test(value)) ?? null;
  const http = safeHttp({ status: response.status, requestId });
  if (!http) throw Object.assign(new Error(), { category: 'REQUEST_FAILED' });
  // Do not echo raw management responses: they can contain project data or credentials.
  if (!response.ok) {
    const error = Object.assign(new Error(), { category: 'HTTP_ERROR', http });
    throw error;
  }
  try { return { body: await response.text(), http }; }
  catch { throw Object.assign(new Error(), { category: 'BODY_READ_FAILED', http }); }
}

function parseJsonResponse(response) {
  try { return JSON.parse(response.body); }
  catch {
    const error = Object.assign(new Error(), { category: 'JSON_PARSE_FAILED', http: response.http });
    throw error;
  }
}

function httpError(message, http) {
  const error = Object.assign(new Error(), { category: 'HTTP_ERROR', http });
  return error;
}

function dotenvValues(source) {
  return Object.fromEntries(source.split('\n').flatMap(line => {
    const match = line.match(/^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    return match ? [[match[1], match[2].replace(/^['"]|['"]$/g, '')]] : [];
  }));
}

function provenance(env = process.env, { projectRef = null, apiUrl = null } = {}) {
  return {
    release: env.RELEASE_VERSION ?? env.APP_VERSION ?? env.VITE_APP_VERSION ?? null,
    projectRef,
    frontendProjectHost: apiUrl ? new URL(apiUrl).hostname : null,
    checkout: { commit: env.GITHUB_SHA ?? env.CI_COMMIT_SHA ?? null, ref: env.GITHUB_REF ?? env.CI_COMMIT_REF_NAME ?? null },
    workflow: { runId: env.GITHUB_RUN_ID ?? null, attempt: env.GITHUB_RUN_ATTEMPT ?? null },
  };
}

export async function collectHealthReport({ env = process.env, fetchImpl = fetch, read = file => readFile(file, 'utf8') } = {}) {
  const token = env.SUPABASE_ACCESS_TOKEN;
  if (!token) throw new Error('SUPABASE_ACCESS_TOKEN is required for read-only database diagnostics.');
  const projectRef = env.SUPABASE_PROJECT_REF ?? env.PROJECT_REF
    ?? (await read(path.join(REPO_ROOT, 'Backend/supabase/.temp/project-ref'))).trim();
  if (!/^[a-z0-9]{20}$/.test(projectRef)) throw new Error('Project ref is missing or invalid.');
  let fileEnv = {};
  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_PUBLISHABLE_KEY) {
    try { fileEnv = dotenvValues(await read(path.join(REPO_ROOT, 'Frontend-PWA/.env'))); } catch { /* CI can supply env only. */ }
  }
  const apiUrl = env.VITE_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL ?? fileEnv.VITE_SUPABASE_URL ?? fileEnv.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    ?? fileEnv.VITE_SUPABASE_PUBLISHABLE_KEY ?? fileEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!apiUrl || !publishableKey) throw new Error('The frontend Supabase URL and publishable key are required.');
  if (new URL(apiUrl).hostname !== `${projectRef}.supabase.co`) {
    throw new Error('Frontend and linked database refer to different projects.');
  }
  const managementUrl = `https://api.supabase.com/v1/projects/${projectRef}`;
  const authorization = { Authorization: `Bearer ${token}` };
  const sql = await read(new URL('./db-health.sql', import.meta.url));
  const [database, resources, ...reads] = await Promise.all([
    observe('Database diagnostics', async () => {
      const response = await request(`${managementUrl}/database/query`, {
        method: 'POST', headers: { ...authorization, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: sql, read_only: true }),
      }, fetchImpl);
      const rows = parseJsonResponse(response);
      const health = rows[0]?.health;
      if (!health?.cron24h || !health?.observedAt) throw httpError('Database diagnostics returned no health record.', response.http);
      return { data: sanitizeHealthPayload(health), http: response.http, metadataCoverage: validateDatabaseMetadata(health) };
    }),
    observe('Host resources', async () => {
      const sampleStartedAt = new Date().toISOString();
      const response = await request(`${managementUrl}/analytics/endpoints/metrics`, { headers: authorization }, fetchImpl);
      const sampleCompletedAt = new Date().toISOString();
      const metrics = parseResourceMetrics(response.body);
      if (metrics.memoryBytes === null) throw httpError('Host memory metrics are unavailable.', response.http);
      return { data: { ...metrics, hostId: projectRef, sampleStartedAt, sampleCompletedAt }, http: response.http };
    }),
    ...APP_READS.map(({ relation, query, requiresRows }) => observe(relation, async () => {
      const url = new URL(`/rest/v1/${relation}?${query}`, apiUrl);
      const response = await request(url, { headers: { apikey: publishableKey, 'Accept-Profile': 'features' } }, fetchImpl);
      const rows = parseJsonResponse(response);
      if (!Array.isArray(rows)) throw httpError('Data API returned an invalid payload.', response.http);
      if (requiresRows && rows.length === 0) throw httpError('Roster snapshot returned no members.', response.http);
      return { data: { rows: rows.length }, http: response.http };
    })),
  ]);
  const report = buildHealthReport({ observedAt: new Date().toISOString(), database, resources, reads });
  report.provenance = provenance({ ...env, VITE_APP_VERSION: env.VITE_APP_VERSION ?? fileEnv.VITE_APP_VERSION }, { projectRef, apiUrl });
  report.sampleWindow = { startedAt: [database, resources, ...reads].map(item => item.sampleStartedAt).sort()[0],
    completedAt: [database, resources, ...reads].map(item => item.sampleCompletedAt).sort().at(-1) };
  report.sampleCoverage = [database, resources, ...reads].map(item => ({ label: item.label, status: item.status,
    window: { startedAt: item.sampleStartedAt, completedAt: item.sampleCompletedAt }, http: item.http ?? null,
    unavailable: item.status === 'SUCCESS' ? null : failureLabel(item) }));
  report.unavailableEvidence = report.sampleCoverage.filter(item => item.status !== 'SUCCESS')
    .map(({ label, unavailable }) => ({ label, reason: unavailable }));
  const resourceFields = ['memoryBytes', 'availableMemoryBytes', 'swapUsedBytes', 'lifetimeSwapInPages',
    'lifetimeSwapOutPages', 'lifetimeIoWaitPercent'];
  const resourceData = resources.status === 'SUCCESS' ? resources.data : null;
  for (const field of resourceFields) if (resourceData?.[field] == null) {
    report.unavailableEvidence.push({ label: `host.${field}`, reason: 'Metric is missing from this resource sample.' });
  }
  const metadataCoverage = database.status === 'SUCCESS' ? database.metadataCoverage
    : { databaseCounters: false, snapshotPublication: false, pipelineHeartbeats: false };
  for (const [field, label, reason] of [
    ['databaseCounters', 'databaseCounters', 'Required database counter keys are missing or invalid.'],
    ['snapshotPublication', 'snapshotPublication', 'Required roster/headhunter publication markers are missing or invalid.'],
    ['pipelineHeartbeats', 'pipelineHeartbeats', 'Required ingestor/scanner heartbeat metadata is missing or invalid.'],
  ]) if (!metadataCoverage?.[field]) report.unavailableEvidence.push({ label, reason });
  report.unavailableEvidence.push({ label: 'exporterSampleAge', reason: 'Metrics endpoint does not expose scrape age.' });
  report.unavailableEvidence.push({ label: 'providerLogs', reason: 'Not collected by this bounded observer.' });
  report.unavailableEvidence.push({ label: 'providerDiskBudget', reason: 'Not exposed by this collector.' });
  report.evidenceCoverage = {
    hostResources: resources.status,
    databaseCounters: metadataCoverage?.databaseCounters ? 'AVAILABLE' : 'UNAVAILABLE',
    snapshotPublication: metadataCoverage?.snapshotPublication ? 'AVAILABLE' : 'UNAVAILABLE',
    pipelineHeartbeats: metadataCoverage?.pipelineHeartbeats ? 'AVAILABLE' : 'UNAVAILABLE',
    providerLogs: 'NOT_COLLECTED', providerDiskBudget: 'NOT_EXPOSED_BY_THIS_COLLECTOR',
  };
  report.databaseEvidenceStatus = Object.values(metadataCoverage ?? {}).every(Boolean) ? 'AVAILABLE' : 'INCOMPLETE';
  report.freshness = buildFreshnessEvidence(report.observedAt,
    database.status === 'SUCCESS' ? database.data.snapshotPublication : null,
    database.status === 'SUCCESS' ? database.data.heartbeats : null);
  return report;
}

export function formatHealthReport(report) {
  const lines = [`Database connection: ${report.currentStatus}`, `Observed at: ${report.observedAt}`];
  if (report.databaseEvidenceStatus) lines.push(`Database evidence: ${report.databaseEvidenceStatus}`);
  for (const read of report.reads) {
    lines.push(`${read.label}: ${read.status === 'SUCCESS' ? `${read.data.rows} rows in ${read.elapsedMs} ms` : failureLabel(read)}`);
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
  } else lines.push(`Database diagnostics: ${failureLabel(report.database)}`);
  if (report.resources.status === 'SUCCESS') {
    const metrics = report.resources.data;
    const mib = value => value === null ? 'unavailable' : `${(value / BYTES_PER_MIB).toFixed(1)} MiB`;
    lines.push(`Host RAM: ${mib(metrics.memoryBytes)} total; ${mib(metrics.availableMemoryBytes)} available; swap used ${mib(metrics.swapUsedBytes)}`);
    lines.push(`Host lifetime: ${metrics.lifetimeIoWaitPercent?.toFixed(1) ?? 'unavailable'}% CPU time waiting for disk; swapped in ${metrics.lifetimeSwapInPages ?? 'unavailable'} pages, out ${metrics.lifetimeSwapOutPages ?? 'unavailable'} pages`);
    lines.push('Swap and disk-wait counters are cumulative. High swap alone does not establish current memory pressure.');
  } else lines.push(`Host resources: ${failureLabel(report.resources)}`);
  lines.push(`Recent history: ${report.historyStatus}`);
  if (report.resourceInterval) {
    const interval = report.resourceInterval;
    lines.push(`Host interval: ${interval.status}`);
    if (interval.identitySource) lines.push(`Counter continuity identity: ${interval.identitySource === 'HOST_BOOT_TIME' ? 'host boot time' : 'PostgreSQL process start time'}`);
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
    console.error('Database diagnostics failed (setup, usage, or output unavailable).');
    process.exitCode = 1;
  }
}
