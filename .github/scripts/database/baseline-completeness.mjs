// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkFoldState } from './fold-state.mjs';

const FOLD_STATUSES = new Set(['folded', 'reconciled', 'unfolded', 'semantic-only']);
const COUNT_KEYS = ['folded', 'reconciled', 'unfolded', 'semantic-only'];

/**
 * Validate the fold-state SSOT and decide which baseline guarantees can be
 * claimed. A valid UNFOLDED report is partial progress, never equivalence.
 */
export function decideBaselineCompleteness(report) {
  if (!report || typeof report !== 'object' || Array.isArray(report) || report.version !== 1) {
    throw new Error('Unsupported or malformed fold-state report (expected version 1 object).');
  }
  if (!['FOLDED', 'UNFOLDED', 'DEGRADED'].includes(report.status)) {
    throw new Error(`Unsupported fold-state status: ${String(report.status)}.`);
  }
  if (typeof report.baseline !== 'string' || !report.baseline.endsWith('_master_migration.sql')
    || !Number.isSafeInteger(report.migrationsReplayed) || report.migrationsReplayed < 0) {
    throw new Error('Malformed fold-state baseline or replay count.');
  }
  if (report.status === 'DEGRADED') {
    throw new Error('Fold-state is DEGRADED; refusing database verification classification.');
  }
  if (!report.counts || typeof report.counts !== 'object' || Array.isArray(report.counts)) {
    throw new Error('Malformed fold-state counts.');
  }
  const countKeys = Object.keys(report.counts).sort();
  if (countKeys.length !== COUNT_KEYS.length || !COUNT_KEYS.every(key => countKeys.includes(key))) {
    throw new Error('Unsupported fold-state count schema.');
  }
  for (const key of COUNT_KEYS) {
    if (!Number.isSafeInteger(report.counts[key]) || report.counts[key] < 0) {
      throw new Error(`Malformed fold-state count: ${key}.`);
    }
  }
  if (!Array.isArray(report.objects) || !Array.isArray(report.unsupported)) {
    throw new Error('Malformed fold-state object or unsupported-statement list.');
  }

  const observedCounts = Object.fromEntries(COUNT_KEYS.map(key => [key, 0]));
  const unfoldedSources = new Set();
  const keys = new Set();
  for (const object of report.objects) {
    if (!object || typeof object !== 'object'
      || typeof object.key !== 'string' || !object.key
      || typeof object.source !== 'string' || !object.source
      || !FOLD_STATUSES.has(object.status)) {
      throw new Error('Malformed or unsupported fold-state object entry.');
    }
    if (object.status === 'unfolded' && !['ABSENT', 'DIVERGENT'].includes(object.reason)) {
      throw new Error(`Unsupported unfolded-object reason for ${object.key}.`);
    }
    if (object.status === 'folded' && object.reason !== undefined) {
      throw new Error(`Contradictory folded-object reason for ${object.key}.`);
    }
    if (keys.has(object.key)) throw new Error(`Duplicate fold-state object key: ${object.key}.`);
    keys.add(object.key);
    observedCounts[object.status] += 1;
    if (object.status === 'unfolded') unfoldedSources.add(object.source);
  }
  for (const key of COUNT_KEYS) {
    if (observedCounts[key] !== report.counts[key]) {
      throw new Error(`Fold-state count mismatch for ${key}: ${report.counts[key]} reported, ${observedCounts[key]} observed.`);
    }
  }
  for (const item of report.unsupported) {
    if (!item || typeof item !== 'object' || typeof item.source !== 'string' || !item.source
      || typeof item.statement !== 'string' || !item.statement) {
      throw new Error('Malformed unsupported fold-state entry.');
    }
  }

  if (report.status === 'FOLDED') {
    if (report.counts.unfolded !== 0 || report.counts['semantic-only'] !== 0 || report.unsupported.length !== 0) {
      throw new Error('Contradictory FOLDED report; refusing completeness claim.');
    }
    return {
      status: report.status,
      mode: 'complete',
      pendingObjectCount: 0,
      pendingMigrationCount: 0,
      semanticOnlyObjectCount: 0,
      unsupportedStatementCount: 0,
      baselinePgTap: true,
      fullReplayPgTap: true,
      catalogEquivalence: true,
    };
  }

  if (report.counts.unfolded === 0 || unfoldedSources.size === 0
    || unfoldedSources.size > report.migrationsReplayed) {
    throw new Error('Contradictory UNFOLDED report without pending objects and migrations.');
  }
  return {
    status: report.status,
    mode: 'partial',
    pendingObjectCount: report.counts.unfolded,
    pendingMigrationCount: unfoldedSources.size,
    semanticOnlyObjectCount: report.counts['semantic-only'],
    unsupportedStatementCount: report.unsupported.length,
    baselinePgTap: false,
    fullReplayPgTap: true,
    catalogEquivalence: false,
  };
}

async function main() {
  const migrationsDir = process.argv[2];
  if (!migrationsDir) throw new Error('Usage: baseline-completeness.mjs <migrations-directory>');
  const report = await checkFoldState({ migrationsDir: path.resolve(migrationsDir) });
  console.log(JSON.stringify(decideBaselineCompleteness(report)));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(`BASELINE-VERIFICATION-STATE-INVALID: ${error.message}`);
    process.exitCode = 2;
  });
}
