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
  computeFanout, deriveTopUp, parseEdgePropagation, parseEdgeReads, parseGithubSecrets,
  parseVaultPropagation, parseVaultReads, parseVaultReadsByRoutine, render, renderPlan,
  riskyCredentials,
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

async function readSources(repoRoot) {
  return {
    workflows: await readAll(path.join(repoRoot, '.github/workflows'), name => /\.ya?ml$/.test(name)),
    functions: await readAll(path.join(repoRoot, 'Backend/supabase/functions'), name => /\.ts$/.test(name)),
    migrations: await readAll(path.join(repoRoot, 'Backend/supabase/migrations'), name => /\.sql$/.test(name)),
  };
}

/**
 * The plan the deploy acts on. Same parsers as the report, so what is measured
 * and what is done can never disagree.
 *
 * `aligned` is the alignment probe's verdict: true only when every live body
 * carrying a literal carries the value currently in Vault. Anything else holds
 * the risky names back, including not knowing.
 */
export async function planCredentialTopUp({ repoRoot = REPO_ROOT, env = process.env, aligned = null, liveLiteralRoutines = [] } = {}) {
  const { workflows, functions, migrations } = await readSources(repoRoot);
  const vaultReadsByRoutine = parseVaultReadsByRoutine(migrations);
  return deriveTopUp({
    edgeReads: parseEdgeReads(functions),
    vaultReads: parseVaultReads(migrations),
    edgePropagated: parseEdgePropagation(workflows),
    vaultPropagated: parseVaultPropagation(workflows),
    availableEnv: new Set(Object.keys(env).filter(key => (env[key] || '').length > 0)),
    risky: riskyCredentials({ liveLiteralRoutines, vaultReadsByRoutine }),
    aligned,
  });
}

export async function auditCredentialFanout({ repoRoot = REPO_ROOT, snapshotPath = null } = {}) {
  const { workflows, functions, migrations } = await readSources(repoRoot);

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
  // Annotate with what the deploy's gated top-up will do unattended. A name
  // the top-up already covers is not a standing manual step, it is one waiting
  // on a condition, and the report should say which.
  const plan = deriveTopUp({
    edgeReads: parseEdgeReads(functions),
    vaultReads: parseVaultReads(migrations),
    edgePropagated: parseEdgePropagation(workflows),
    vaultPropagated: parseVaultPropagation(workflows),
    availableEnv: null,
    aligned: null,
  });
  const byName = new Map(report.entries.map(entry => [entry.name, entry]));
  const addNote = (name, note) => {
    const entry = byName.get(name);
    if (entry) entry.pending = [...(entry.pending || []), note];
  };
  for (const item of plan.gated) {
    addNote(item.name, `the deploy propagates this to the ${item.channel} on its own once alignment with Vault is confirmed.`);
  }
  for (const channel of ['edge', 'vault']) {
    for (const name of plan[channel]) addNote(name, `the deploy tops this up in the ${channel} unattended.`);
  }

  return { ...report, liveNote };
}

/**
 * Reads the alignment verdict the deploy passes in. Three states, and only the
 * explicit "aligned" unlocks a risky name: an unset or unrecognised value is
 * "not known", which holds back. A flag that defaulted to permissive would put
 * the whole safety argument behind a typo.
 */
export function parseAlignedFlag(raw) {
  if (raw === 'aligned') return true;
  if (raw === 'divergent') return false;
  return null;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const emit = process.argv.indexOf('--emit');
  if (emit !== -1) {
    // Called by the deploy. Prints bare names, one per line, for a shell loop.
    // Any failure prints nothing and exits 0: the deploy's existing explicit
    // propagation is the floor, and a broken plan must subtract nothing from it.
    try {
      const alignedAt = process.argv.indexOf('--aligned');
      const routinesAt = process.argv.indexOf('--live-literal-routines');
      const plan = await planCredentialTopUp({
        aligned: parseAlignedFlag(alignedAt === -1 ? null : process.argv[alignedAt + 1]),
        liveLiteralRoutines: routinesAt === -1 ? [] : (process.argv[routinesAt + 1] || '').split(',').filter(Boolean),
      });
      const channel = process.argv[emit + 1];
      if (channel === 'plan') process.stdout.write(renderPlan(plan));
      else for (const name of plan[channel] || []) process.stdout.write(`${name}\n`);
    } catch { /* An empty plan is the safe plan. */ }
    process.exit(0);
  }

  const flag = process.argv.indexOf('--snapshot');
  const report = await auditCredentialFanout({ snapshotPath: flag === -1 ? null : process.argv[flag + 1] });
  if (process.argv.includes('--json')) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else process.stdout.write(`${render(report)}\n${report.liveNote}\n`);
  // Reporting only. The count is a fact to act on, not a build failure.
  process.exitCode = 0;
}
