// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const HOUR_MS = 3_600_000;
// Six sequential 25-second analytics requests leave room for the 120-second host
// pair, bounded artifact reads and upload inside the workflow's ten-minute cap.
export const MAX_CATCHUP_HOURS = 6;
const MAX_ARCHIVE_BYTES = 4 * 1024 * 1024;
const MAX_ATTEMPTS = 256;
const run = promisify(execFile);

export function completedLogWindows(now) {
  const end = Math.floor(now / HOUR_MS) * HOUR_MS;
  const first = Math.ceil((now - 24 * HOUR_MS) / HOUR_MS) * HOUR_MS;
  return Array.from({ length: (end - first) / HOUR_MS }, (_, i) => {
    const start = first + i * HOUR_MS;
    return { start: new Date(start).toISOString(), end: new Date(start + HOUR_MS).toISOString(),
      hourKey: new Date(start).toISOString().slice(0, 13) + ':00Z', basis: 'bounded_missing_completed_utc_hour' };
  });
}

export function mergeLogAttempts(archives, now, projectRef) {
  const eligible = new Set(completedLogWindows(now).map(window => window.start));
  const seen = new Set();
  const attempts = [];
  let invalid = 0;
  let projectMismatches = 0;
  for (const archive of archives) {
    const entries = Array.isArray(archive?.attempts) ? archive.attempts : [];
    for (const attempt of entries) {
      const evidence = attempt?.evidence;
      const start = Date.parse(evidence?.window?.start);
      const end = Date.parse(evidence?.window?.end);
      if (!['SUCCESS', 'DEGRADED', 'UNAVAILABLE'].includes(evidence?.status)
        || !Number.isFinite(start) || start % HOUR_MS || end - start !== HOUR_MS
        || !attempt.provenance || typeof attempt.provenance !== 'object') { invalid++; continue; }
      if (projectRef !== undefined && attempt.provenance.projectRef !== projectRef) { projectMismatches++; continue; }
      if (!eligible.has(new Date(start).toISOString())) continue;
      // Store only one acquisition and its provenance, never embed previous archives.
      const normalized = { provenance: Object.fromEntries(
        ['release', 'projectRef', 'frontendProjectHost', 'checkout', 'workflow'].filter(key => key in attempt.provenance)
          .map(key => [key, attempt.provenance[key]])),
      evidence: Object.fromEntries(['status', 'source', 'queryStatus', 'window', 'http', 'sourceCoverage', 'aggregates',
        'failedDataApiRequests', 'rpcTraces', 'unavailable', 'unknowns', 'acquisition']
        .filter(key => key in evidence).map(key => [key, evidence[key]])) };
      const key = JSON.stringify(normalized);
      if (seen.has(key)) continue;
      seen.add(key);
      attempts.push(normalized);
    }
  }
  attempts.sort((a, b) => String(a.evidence.acquisition?.startedAt ?? '').localeCompare(String(b.evidence.acquisition?.startedAt ?? '')));
  const truncated = attempts.length > MAX_ATTEMPTS;
  return { attempts: attempts.slice(-MAX_ATTEMPTS), invalid, projectMismatches, truncated };
}

export function planLogCatchup(archives, now, currentWindow, projectRef) {
  const merged = mergeLogAttempts(archives, now, projectRef);
  const complete = new Set(merged.attempts.filter(attempt => attempt.evidence.status === 'SUCCESS')
    .map(attempt => attempt.evidence.window.start));
  const missing = completedLogWindows(now).filter(window => !complete.has(window.start));
  return { ...merged, missing, selected: missing.filter(window => window.start !== currentWindow.start).slice(0, MAX_CATCHUP_HOURS) };
}

export async function readObserverHistory({ env = process.env, execute = run } = {}) {
  if (!env.GITHUB_REPOSITORY || !env.GH_TOKEN) return { status: 'UNAVAILABLE', archives: [], unknowns: ['GitHub artifact history credentials unavailable.'] };
  let directory;
  const archives = [];
  const unknowns = [];
  try {
    const result = await execute('gh', ['run', 'list', '--repo', env.GITHUB_REPOSITORY, '--workflow', 'db-observe.yml',
      '--branch', 'Stable', '--status', 'completed', '--limit', '3', '--json', 'databaseId'],
    { env, timeout: 15_000, maxBuffer: 64 * 1024 });
    const runs = JSON.parse(result.stdout);
    if (!Array.isArray(runs) || runs.length > 3 || runs.some(item => !Number.isSafeInteger(item.databaseId))) throw new Error('Invalid workflow history');
    directory = await mkdtemp(path.join(os.tmpdir(), 'db-observe-history-'));
    for (const item of runs) {
      const destination = path.join(directory, String(item.databaseId));
      try {
        await execute('gh', ['run', 'download', String(item.databaseId), '--repo', env.GITHUB_REPOSITORY,
          '--pattern', `db-observation-${item.databaseId}-*`, '--dir', destination],
        { env, timeout: 20_000, maxBuffer: 64 * 1024 });
        // Named artifact folders are created by gh; accept only the fixed evidence
        // filename one level below, and cap JSON bytes before parsing.
        const folders = await readdir(destination, { withFileTypes: true });
        if (!folders.length || folders.length > 3) throw new Error('Too many attempts');
        const files = folders.flatMap(folder => folder.isDirectory()
          ? [path.join(destination, folder.name, 'db-observation.json')]
          : folder.isFile() && folder.name === 'db-observation.json' ? [path.join(destination, folder.name)] : []);
        if (!files.length) throw new Error('No observation evidence');
        for (const file of files) {
          if ((await stat(file)).size > MAX_ARCHIVE_BYTES) throw new Error('Oversize artifact');
          const value = JSON.parse(await readFile(file, 'utf8'));
          if (value.collector !== 'db-observe' || value.schemaVersion !== 1
            || value.samples?.[0]?.provenance?.workflow?.runId !== String(item.databaseId)) throw new Error('Invalid artifact');
          const provenance = value.samples?.[0]?.provenance ?? {};
          if (value.logArchive && value.logArchive.schemaVersion !== 1) throw new Error('Unsupported archive');
          const entries = value.logArchive?.attempts ?? [];
          if (!Array.isArray(entries) || entries.length > MAX_ATTEMPTS) throw new Error('Invalid archive');
          archives.push({ attempts: [...entries, ...(value.providerLogs?.window ? [{ provenance, evidence: value.providerLogs }] : [])] });
        }
      } catch { unknowns.push(`Observer artifact history unavailable for run ${item.databaseId}.`); }
    }
    return { status: unknowns.length ? 'DEGRADED' : 'SUCCESS', archives, unknowns };
  } catch {
    return { status: 'UNAVAILABLE', archives, unknowns: [...unknowns, 'Observer workflow history could not be acquired or interpreted.'] };
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true });
  }
}
