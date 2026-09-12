#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * ============================================================================
 * SCRIPT: DATABASE DRIFT AUDIT
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Compares what the migrations declare against what the live
 * database actually contains, in BOTH directions, from a read-only snapshot
 * produced by db-drift-snapshot.sql.
 *
 * WHY THIS EXISTS
 * Stage 3 audits the migrations statically and has reported DB-UNAVAILABLE on
 * 6 of 6 nights it has ever run, because the Jules sandbox has no Supabase and
 * no docker. Nothing has ever compared the two sides. They are known to
 * disagree both ways:
 *
 *   declared, absent live   master_migration's CREATE TABLE IF NOT EXISTS
 *                           silently skipped columns against an existing
 *                           table, and report_heartbeat raised 42703 on every
 *                           call for three and a half days.
 *   live, never declared    five indexes on drivers.player_battles, and cron
 *                           job 38 running every minute. Grepping the
 *                           migrations for them returns nothing.
 *
 * On 2026-09-06 that produced two wrong conclusions in a row, including a near
 * miss where cron.unschedule would have deleted the only copy of a job's
 * definition. The migrations are not a description of the live database, and
 * until now nothing said so out loud.
 *
 * DIRECTION MATTERS, SO THEY ARE REPORTED SEPARATELY
 * "Declared but missing" is a deployment failure: someone will rebuild from
 * the baseline and get a database that does not work. "Live but undeclared" is
 * a knowledge failure: the object is load bearing and its only definition is
 * in the database, so a rebuild silently loses it. Collapsing the two into one
 * "drift" count is how the 2026-09-06 reasoning went wrong.
 *
 * CRON SCHEDULES ARE NOT CHECKED HERE
 * audit-cron-schedule.mjs already does that against the live database, with
 * its own manifest and a NOT_COMPARED exit code. Duplicating it would create a
 * second authority on the same fact, which is the defect this repository has
 * now hit three times. Its one gap is cadence, not coverage: it runs only
 * inside deploy-supabase.yml, so it fires only when Backend/** changes.
 *
 * NOT_COMPARED IS NOT A PASS
 * A snapshot that is missing, malformed, or empty exits 2, never 0. The whole
 * premise of this audit is that an absent answer has been silently reading as
 * a clean one for six nights.
 * ============================================================================
 */

import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { identifyDefinition } from './audit-migrations.mjs';
// parseRows is imported, not reimplemented: the CLI emits two different JSON
// shapes depending on whether it thinks it is talking to an agent, and that
// lesson is already encoded and tested there.
import { parseRows } from './audit-cron-schedule.mjs';
import { lexSql } from './sql-lexer.mjs';

const run = promisify(execFile);

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..', '..');
const BASELINE = 'Backend/supabase/migrations/20260531232406_master_migration.sql';

/** Distinct so "could not compare" can never be mistaken for "matched". */
export const EXIT = { MATCH: 0, DRIFT: 1, NOT_COMPARED: 2 };

/**
 * Objects the baseline declares, keyed the same way the live snapshot keys
 * them. Parsing is delegated to the migration audit's own identifyDefinition,
 * because a second parser for this file is exactly how the baseline ended up
 * with three checkers that disagreed.
 */
export function declaredObjects(baselineSource) {
  const parsed = lexSql(baselineSource);
  if (parsed.error) return { error: parsed.error };

  const tables = new Set();
  const indexes = new Set();
  const routines = new Set();
  const rls = new Set();
  // Routines the baseline declares as resolving their credential at runtime.
  // Used to tell "the live body is behind the repository" apart from "the
  // repository never had a safe version", which call for opposite actions.
  const vaultRoutines = new Set();

  for (const statement of parsed.statements) {
    const definition = identifyDefinition(statement);
    if (!definition) continue;
    if (definition.kind === 'TABLE') tables.add(definition.name);
    else if (definition.kind === 'INDEX') indexes.add(definition.name.replace(/^.*\./, ''));
    else if (definition.kind === 'FUNCTION') {
      routines.add(definition.name);
      if (VAULT_LOOKUP.test(statement.executable)) vaultRoutines.add(definition.name.replace(/\(.*$/, ''));
    }
  }

  // RLS is an ALTER, not a CREATE, so identifyDefinition does not model it.
  for (const statement of parsed.statements) {
    const sql = statement.executable.replace(/\s+/g, ' ').trim();
    const match = /^ALTER TABLE(?: IF EXISTS)? ([\w".]+) ENABLE ROW LEVEL SECURITY/i.exec(sql);
    if (match) rls.add(match[1].replaceAll('"', '').toLowerCase());
  }

  return { tables, indexes, routines, rls, vaultRoutines };
}

/**
 * A credential resolved at runtime rather than carried as a literal. Both
 * sides test for the call, never for the value, so nothing here can leak one.
 */
const VAULT_LOOKUP = /get_vault_secret\s*\(/i;

const qualify = (schema, name) => `${schema}.${name}`.toLowerCase();

/**
 * Compares one snapshot against one baseline. Pure, so the whole audit is
 * testable without a database.
 */
export function compareDrift(snapshot, declared) {
  const findings = [];
  const note = (direction, kind, object, consequence) =>
    findings.push({ direction, kind, object, consequence });

  // Index names are compared BARE on both sides. CREATE INDEX names the index
  // without a schema (the schema comes from the table), so identifyDefinition
  // yields `idx_members_tag`. Keying the live side as `drivers.idx_members_tag`
  // made every live index read as undeclared, which would have reported the
  // whole index set as drift on the first real run.
  const liveIndexes = new Map((snapshot.indexes || []).map(i => [String(i.name).toLowerCase(), i]));
  const liveRoutines = new Set((snapshot.routines || []).map(r => qualify(r.schema, r.name)));
  const liveRls = new Set((snapshot.rlsEnabled || []).map(t => qualify(t.schema, t.table)));
  const liveTables = new Set((snapshot.columns || []).map(c => qualify(c.schema, c.table)));

  // Declared but missing: a rebuild from the baseline produces a database that
  // does not work, and the failure surfaces at runtime rather than at deploy.
  for (const table of declared.tables) {
    if (!liveTables.has(table)) note('DECLARED_NOT_LIVE', 'TABLE', table, 'The baseline declares this table and the live database does not have it.');
  }
  for (const routine of declared.routines) {
    const bare = routine.replace(/\(.*$/, '');
    if (!liveRoutines.has(bare)) note('DECLARED_NOT_LIVE', 'FUNCTION', bare, 'The baseline declares this function and the live database does not have it.');
  }
  for (const table of declared.rls) {
    if (liveTables.has(table) && !liveRls.has(table)) {
      note('DECLARED_NOT_LIVE', 'RLS', table, 'The baseline enables row level security on this table and the live database has it disabled.');
    }
  }

  // Live but undeclared: the object is load bearing and its only definition is
  // in the database, so a rebuild from the baseline silently loses it. This is
  // the direction that caused the 2026-09-06 near miss.
  for (const [name, index] of liveIndexes) {
    // Constraint-backed indexes are created by their PRIMARY KEY or UNIQUE
    // constraint and cannot be declared separately, so they are not drift.
    //
    // The database is asked directly. The first production run guessed from
    // the name and reported members_new_pkey1 and several *_unique indexes as
    // drift, because the suffix test matched only _pkey and _key. The name
    // heuristic remains as a fallback for a snapshot taken before the field
    // existed, so an old snapshot degrades rather than lying.
    if (index.constraintBacked === true) continue;
    if (index.constraintBacked === undefined && (/_pkey\d*$/.test(name) || /_key$/.test(name))) continue;
    if (!declared.indexes.has(name)) {
      note('LIVE_NOT_DECLARED', 'INDEX', qualify(index.schema, name), 'This index exists only in the live database. A rebuild from the baseline would not create it, and its performance would not be reproduced.');
    }
  }

  // Secrets in routine bodies. The live body is what runs, and it is not
  // necessarily what the repository declares, so this reports the live fact
  // and then says which of the two remediations applies.
  //
  // The first production run wrote "it is in no tracked file, so no
  // repository audit can detect it" for three substrate.run_* functions that
  // are in fact declared in master_migration.sql, reading from Vault. The
  // claim was wrong and it pointed at the wrong fix: the safe version already
  // existed in the repository and had simply never reached the database.
  for (const routine of snapshot.routines || []) {
    if (!routine.hasEmbeddedSecret) continue;
    const name = qualify(routine.schema, routine.name);
    const rules = Array.isArray(routine.secretRules) && routine.secretRules.length
      ? ` Matched by: ${routine.secretRules.join(', ')}.`
      : '';

    // The live body carries a literal while the baseline declares the same
    // function resolving its credential at runtime. The database is running
    // an older definition than the repository believes is deployed.
    if (declared.vaultRoutines?.has(name) && routine.usesVaultLookup === false) {
      note('LIVE_SECRET', 'FUNCTION', name, `The live body carries a credential-shaped literal, but the baseline declares this function resolving its credential at runtime. The database is running an older definition than the repository declares. Rotate the credential, then apply the declared definition.${rules}`);
      continue;
    }

    note('LIVE_SECRET', 'FUNCTION', name, `This function body contains a credential-shaped literal. Rotate the credential and resolve it at runtime instead of embedding it.${rules}`);
  }

  return findings;
}

/**
 * Runs the read-only snapshot query against the linked project, using the same
 * invocation audit-cron-schedule.mjs proved out: an explicit --output-format
 * json, because the default emits a human-readable table in CI, and a cwd
 * fallback because deploy-supabase.yml links from Backend/.
 */
export async function captureLiveSnapshot({ repoRoot = REPO_ROOT, exec = run } = {}) {
  const raw = await readFile(path.join(repoRoot, '.github/scripts/database/db-drift-snapshot.sql'), 'utf8');
  // Whole-line SQL comments are stripped before the query is handed to the CLI.
  // The file opens with its licence header, so the argument began with `--` and
  // the CLI parsed the entire query as a flag: "UnrecognizedOption:
  // Unrecognized flag: -- SPDX-License-Identifier". audit-cron-schedule.mjs
  // never hit this because its query is a bare select with no comments. The
  // comments exist for the human reading the file, not for Postgres, and every
  // one of them is on its own line, so removing those lines changes no SQL.
  const sql = raw
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n')
    .trim();
  let stdout = null;
  let lastError = null;
  for (const cwd of [path.join(repoRoot, 'Backend'), repoRoot]) {
    try {
      ({ stdout } = await exec('supabase', ['db', 'query', '--linked', '--output-format', 'json', sql], { cwd, maxBuffer: 32 * 1024 * 1024 }));
      break;
    } catch (error) { lastError = error; }
  }
  if (stdout === null) throw lastError ?? new Error('no linked Supabase project found');

  const rows = parseRows(stdout);
  const value = rows[0] && (rows[0].snapshot ?? rows[0].jsonb_pretty ?? Object.values(rows[0])[0]);
  if (!value) throw new Error('snapshot query returned no snapshot column');
  // jsonb_pretty yields text; a bare jsonb column yields an object. Accept both
  // rather than depending on which the CLI chose today.
  return typeof value === 'string' ? JSON.parse(value) : value;
}

export async function auditDbDrift({ repoRoot = REPO_ROOT, snapshotPath, snapshotObject = null, readFileImpl = readFile } = {}) {
  if (!snapshotPath && !snapshotObject) {
    return { status: 'NOT_COMPARED', reason: 'No snapshot path supplied. The live database was never queried, which is not the same as finding no drift.', findings: [] };
  }

  let snapshot = snapshotObject;
  try {
    if (!snapshot) snapshot = JSON.parse(await readFileImpl(snapshotPath, 'utf8'));
  } catch (error) {
    return { status: 'NOT_COMPARED', reason: `Snapshot could not be read or parsed: ${error.message}`, findings: [] };
  }

  if (!snapshot || typeof snapshot !== 'object' || !Array.isArray(snapshot.columns)) {
    return { status: 'NOT_COMPARED', reason: 'Snapshot is missing its columns array, so the live side is unknown.', findings: [] };
  }
  if (snapshot.columns.length === 0) {
    return { status: 'NOT_COMPARED', reason: 'Snapshot contains zero columns. An empty result is a failed query, not an empty database.', findings: [] };
  }

  const baselineSource = await readFileImpl(path.join(repoRoot, BASELINE), 'utf8');
  const declared = declaredObjects(baselineSource);
  if (declared.error) {
    return { status: 'NOT_COMPARED', reason: `Baseline could not be parsed: ${declared.error}`, findings: [] };
  }

  const findings = compareDrift(snapshot, declared);
  return { status: findings.length ? 'DRIFT' : 'MATCH', reason: null, findings };
}

function render(report) {
  if (report.status === 'NOT_COMPARED') {
    return `Database drift audit: NOT_COMPARED\n  ${report.reason}\n  This is deliberately not a pass. Stage 3 has reported DB-UNAVAILABLE on every night it has run, and that absence has been reading as clean.\n`;
  }
  if (report.status === 'MATCH') {
    return 'Database drift audit: MATCH\n  The baseline and the live database agree in both directions on tables, functions, indexes and row level security, and no routine body carries a credential-shaped literal.\n';
  }

  const byDirection = new Map();
  for (const finding of report.findings) {
    if (!byDirection.has(finding.direction)) byDirection.set(finding.direction, []);
    byDirection.get(finding.direction).push(finding);
  }

  const titles = {
    DECLARED_NOT_LIVE: 'DECLARED IN THE BASELINE, ABSENT LIVE (a rebuild produces a database that does not work)',
    LIVE_NOT_DECLARED: 'LIVE, NEVER DECLARED (a rebuild from the baseline silently loses these)',
    LIVE_SECRET: 'CREDENTIAL IN A LIVE ROUTINE BODY',
  };

  const lines = [`Database drift audit: DRIFT (${report.findings.length} findings)`];
  for (const [direction, items] of byDirection) {
    lines.push('', titles[direction] || direction);
    for (const item of items) lines.push(`  ${item.kind} ${item.object}\n      ${item.consequence}`);
  }
  return `${lines.join('\n')}\n`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const flag = process.argv.indexOf('--snapshot');
  let report;
  if (process.argv.includes('--live')) {
    try {
      report = await auditDbDrift({ snapshotObject: await captureLiveSnapshot() });
    } catch (error) {
      // A failed capture is NOT_COMPARED, never a pass. This is the whole point.
      report = { status: 'NOT_COMPARED', reason: `Live capture failed: ${error.message}`, findings: [] };
    }
  } else {
    report = await auditDbDrift({ snapshotPath: flag === -1 ? null : process.argv[flag + 1] });
  }
  process.stdout.write(process.argv.includes('--json') ? `${JSON.stringify(report, null, 2)}\n` : render(report));
  process.exitCode = report.status === 'MATCH' ? EXIT.MATCH : report.status === 'DRIFT' ? EXIT.DRIFT : EXIT.NOT_COMPARED;
}
