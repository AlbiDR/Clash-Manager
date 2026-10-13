#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const HOUR_MS = 3_600_000;
const MAX_HOURS = 31 * 24;

/** Report coverage without treating sparse samples as continuous uptime. */
export function summarizeObservations(entries, from, to) {
  const start = Date.parse(from);
  const end = Date.parse(to);
  if (![start, end].every(Number.isFinite) || start % HOUR_MS || end % HOUR_MS
    || end <= start || (end - start) / HOUR_MS > MAX_HOURS) {
    throw new Error('Use increasing whole UTC-hour bounds covering at most 31 days.');
  }
  const slots = new Map();
  const invalid = [];
  const runs = [];
  for (const { file, value } of entries) {
    if (value?.collector !== 'db-observe') {
      invalid.push(file);
      continue;
    }
    const samples = value.samples;
    const acquired = Date.parse(samples?.[0]?.sampleWindow?.startedAt);
    if (value.schemaVersion !== 1 || value.sampleCount !== 2 || samples?.length !== 2
      || !Number.isFinite(acquired) || !samples.every(s => ['REACHABLE', 'DEGRADED'].includes(s.currentStatus))) {
      invalid.push(file);
      continue;
    }
    // Setup may cross an hour boundary; the archive's declared bounds win.
    const logWindow = value.providerLogs?.window;
    const logStart = Date.parse(logWindow?.start);
    const logEnd = Date.parse(logWindow?.end);
    if (logWindow && (!Number.isFinite(logStart) || logStart % HOUR_MS || logEnd - logStart !== HOUR_MS)) {
      invalid.push(file);
      continue;
    }
    const hour = logWindow ? logStart : Math.floor(acquired / HOUR_MS) * HOUR_MS - HOUR_MS;
    if (hour < start || hour >= end) continue;
    const slot = new Date(hour).toISOString();
    const run = {
      file, slot, slotBasis: logWindow ? 'declared_provider_window' : 'legacy_sample_start', generatedAt: value.generatedAt ?? null,
      runId: samples[0].provenance?.workflow?.runId ?? null,
      release: samples[0].provenance?.release ?? null,
      checkout: samples[0].provenance?.checkout?.commit ?? null,
      reachability: samples.every(s => s.currentStatus === 'REACHABLE') ? 'REACHABLE' : 'DEGRADED',
      resourceInterval: value.comparison?.resourceInterval?.status ?? 'UNAVAILABLE',
      providerLogs: value.providerLogs?.status ?? 'NOT_COLLECTED',
      providerSourcesObserved: Object.values(value.providerLogs?.sourceCoverage ?? {}).filter(status => status === 'EVENTS_OBSERVED').length,
    };
    runs.push(run);
    slots.set(slot, [...(slots.get(slot) ?? []), run]);
  }
  const expected = Array.from({ length: (end - start) / HOUR_MS }, (_, i) => new Date(start + i * HOUR_MS).toISOString());
  return {
    from: new Date(start).toISOString(), to: new Date(end).toISOString(),
    expectedSlots: expected.length, observedSlots: slots.size,
    missingSlots: expected.filter(slot => !slots.has(slot)),
    duplicateSlots: [...slots].filter(([, records]) => records.length > 1).map(([slot, records]) => ({ slot, runs: records.length })),
    invalidFiles: invalid, runs: runs.sort((a, b) => a.slot.localeCompare(b.slot) || a.file.localeCompare(b.file)),
    limitations: [
      'Hourly reachability samples are not a continuous uptime measurement.',
      'Missing slots and invalid files remain missing evidence; successful retakes do not erase degraded runs.',
      'Duplicate provider-log windows must not be summed; this report preserves runs separately.',
      'Each release and checkout remain attached to the run; changes across versions are not a controlled comparison.',
    ],
  };
}

async function readEntries(directory, depth = 0) {
  if (depth > 8) throw new Error('Observation directory nesting exceeds eight levels.');
  const entries = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, item.name);
    if (item.isDirectory()) entries.push(...await readEntries(file, depth + 1));
    else if (item.isFile() && /^db-observation.*\.json$/.test(item.name)) {
      let value;
      try { value = JSON.parse(await readFile(file, 'utf8')); } catch { value = null; }
      entries.push({ file, value });
    }
    if (entries.length > 1000) throw new Error('Observation directory exceeds 1,000 evidence files.');
  }
  return entries;
}

export async function reportCli(args) {
  const json = args.includes('--json');
  const options = args.filter(arg => arg !== '--json');
  if (options.length !== 5 || options[1] !== '--from' || options[3] !== '--to') {
    throw new Error('Usage: db-observe-report <downloaded-artifacts-directory> --from <UTC hour> --to <UTC hour> [--json]');
  }
  const result = summarizeObservations(await readEntries(path.resolve(options[0])), options[2], options[4]);
  const complete = run => run.reachability === 'REACHABLE' && run.resourceInterval === 'SUCCESS'
    && run.providerLogs === 'SUCCESS' && run.providerSourcesObserved === 4;
  return {
    result,
    output: json ? JSON.stringify(result, null, 2) : [
      `Observation window: ${result.from} to ${result.to} (end excluded)`,
      `Hourly coverage: ${result.observedSlots}/${result.expectedSlots} slots; ${result.missingSlots.length} missing`,
      `Saved runs: ${result.runs.length}; ${result.runs.filter(complete).length} with reachable reads, valid resource pairs and events observed from all four log sources`,
      `Duplicate slots: ${result.duplicateSlots.length}; invalid files: ${result.invalidFiles.length}`,
      `Releases: ${[...new Set(result.runs.map(run => run.release ?? 'unknown'))].join(', ') || 'none'}`,
      ...result.limitations,
    ].join('\n'),
    exitCode: result.missingSlots.length || result.invalidFiles.length || result.runs.some(run => !complete(run)) ? 1 : 0,
  };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const { output, exitCode } = await reportCli(process.argv.slice(2));
    console.log(output);
    process.exitCode = exitCode;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
