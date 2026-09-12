#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * ============================================================================
 * SCRIPT: CREDENTIAL FAN-OUT AUDIT
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Reports, per credential, how many places a human must edit to
 * rotate it. The goal is one: GitHub Secrets, with every other copy derived.
 *
 * Reads only NAMES out of tracked source. It cannot read a credential value.
 *
 * Pass --snapshot <file> to fold in the live drift snapshot, which names the
 * routines whose LIVE body carries a literal. Without it the audit reports the
 * repository's intent; with it, what is actually deployed.
 * ============================================================================
 */

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  computeFanout, parseEdgePropagation, parseEdgeReads, parseGithubSecrets,
  parseVaultPropagation, parseVaultReads, parseVaultReadsByRoutine, render,
} from './credential-fanout.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..', '..');

async function readAll(dir, filter) {
  const out = [];
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await readAll(full, filter));
    else if (filter(entry.name)) out.push(await readFile(full, 'utf8'));
  }
  return out;
}

export async function auditCredentialFanout({ repoRoot = REPO_ROOT, snapshotPath = null } = {}) {
  const workflows = await readAll(path.join(repoRoot, '.github/workflows'), name => /\.ya?ml$/.test(name));
  const functions = await readAll(path.join(repoRoot, 'Backend/supabase/functions'), name => /\.ts$/.test(name));
  const migrations = await readAll(path.join(repoRoot, 'Backend/supabase/migrations'), name => /\.sql$/.test(name));

  let liveLiteralRoutines = [];
  let liveNote = 'No live snapshot was supplied, so this is what the repository intends, not what is deployed.';
  if (snapshotPath) {
    try {
      const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
      liveLiteralRoutines = (snapshot.routines || [])
        .filter(routine => routine.hasEmbeddedSecret)
        .map(routine => `${routine.schema}.${routine.name}`.toLowerCase());
      liveNote = `Live snapshot folded in: ${liveLiteralRoutines.length} routines carry a literal.`;
    } catch (error) {
      liveNote = `The live snapshot could not be read (${error.message}), so live copies are NOT counted below.`;
    }
  }

  const report = computeFanout({
    githubSecrets: parseGithubSecrets(workflows),
    edgePropagated: parseEdgePropagation(workflows),
    vaultPropagated: parseVaultPropagation(workflows),
    edgeReads: parseEdgeReads(functions),
    vaultReads: parseVaultReads(migrations),
    vaultReadsByRoutine: parseVaultReadsByRoutine(migrations),
    liveLiteralRoutines,
  });
  return { ...report, liveNote };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const flag = process.argv.indexOf('--snapshot');
  const report = await auditCredentialFanout({ snapshotPath: flag === -1 ? null : process.argv[flag + 1] });
  if (process.argv.includes('--json')) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else process.stdout.write(`${render(report)}\n${report.liveNote}\n`);
  // Reporting only. The count is a fact to act on, not a build failure.
  process.exitCode = 0;
}
