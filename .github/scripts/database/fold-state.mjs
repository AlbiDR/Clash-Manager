#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { identifyDefinition } from './audit-migrations.mjs';
import { lexSql } from './sql-lexer.mjs';

const BASELINE_PREFIX = '20260531232406';
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function compact(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/;$/, '')
    .toLowerCase();
}

function compactDefinition(sql) {
  return compact(sql).replace(/^create (schema|table|materialized view|index|extension) if not exists /, 'create $1 ');
}

function unquote(value) {
  return value.replaceAll('"', '').toLowerCase();
}

/** Splits an argument list at its top-level commas, so numeric(10,2) stays whole. */
function splitArguments(value) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '(') depth += 1;
    else if (value[index] === ')') depth -= 1;
    else if (value[index] === ',' && depth === 0) {
      parts.push(value.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(value.slice(start));
  return parts.map(part => part.trim()).filter(Boolean);
}

function normalizeType(value) {
  return value.replaceAll('"', '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * `name(args) rest` as a routine name, its argument types and what follows, or
 * null when the parentheses do not balance. The argument modes are dropped, as
 * identifyDefinition drops them; argument NAMES cannot be told apart from
 * multi-word types here, so signatureMatches tolerates either.
 */
function routineTarget(text) {
  const head = text.match(/^([\w".]+)\s*\(/);
  if (!head) return null;
  let depth = 0;
  for (let index = head[0].length; index < text.length; index += 1) {
    if (text[index] === '(') depth += 1;
    else if (text[index] === ')') {
      if (depth > 0) {
        depth -= 1;
        continue;
      }
      const args = splitArguments(text.slice(head[0].length, index))
        .map(argument => normalizeType(argument.replace(/^(?:INOUT|IN|OUT|VARIADIC)\s+/i, '')));
      return { name: unquote(head[1]), args, rest: text.slice(index + 1).trim() };
    }
  }
  return null;
}

/** A setting's value as a comparable list: quotes, case and spacing do not matter, order does. */
function settingValue(raw) {
  return raw.split(',').map(item => item.replace(/['"]/g, '').trim().toLowerCase()).filter(Boolean).join(', ');
}

/** A policy name as identifyDefinition would key it: quotes off, "" unescaped, lower case. */
function policyName(raw) {
  const quoted = raw.match(/^"((?:[^"]|"")*)"$/);
  return (quoted ? quoted[1].replaceAll('""', '"') : raw).toLowerCase();
}

/**
 * The POLICY key a CREATE POLICY statement declares, quote-aware. identifyDefinition
 * cannot read a quoted name containing spaces ("voyage read access"), so an
 * absence check built on its keys would pass vacuously for exactly the names
 * this repository uses.
 */
function createdPolicyKey(statement) {
  const match = statement.executable.replace(/\s+/g, ' ').trim()
    .match(/^CREATE POLICY ("(?:[^"]|"")+"|[A-Za-z_][\w$]*) ON ([\w".]+)/i);
  return match ? `POLICY:${policyName(match[1])}@${unquote(match[2])}` : null;
}

function mutation(statement) {
  const sql = statement.executable.replace(/\s+/g, ' ').trim();
  let match = sql.match(/^DROP (FUNCTION|VIEW|MATERIALIZED VIEW|TABLE|TYPE|INDEX)(?: IF EXISTS)? ([\w".]+)/i);
  if (match) return { key: `${match[1].replace(' ', '_').toUpperCase()}:${unquote(match[2])}`, mode: 'absent', sql };
  match = sql.match(/^COMMENT ON (TABLE|COLUMN|FUNCTION|VIEW|MATERIALIZED VIEW) ([\w".]+(?:\([^)]*\))?) IS /i);
  if (match) return { key: `COMMENT:${match[1].replace(' ', '_').toUpperCase()}:${unquote(match[2])}`, mode: 'exact', sql };
  match = sql.match(/^(GRANT|REVOKE)\s+(.+?)\s+ON\s+(?:TABLE\s+|FUNCTION\s+)?([\w".]+(?:\([^)]*\))?)\s+(TO|FROM)\s+(.+?);?$/i);
  if (match) return { key: `PRIVILEGE:${unquote(match[3])}:${compact(`${match[1]} ${match[2]} ${match[4]} ${match[5]}`)}`, mode: 'exact', sql };
  match = sql.match(/^ALTER TABLE(?: IF EXISTS)? ([\w".]+) ENABLE ROW LEVEL SECURITY/i);
  if (match) return { key: `RLS:${unquote(match[1])}`, mode: 'rls', table: match[1], sql };
  match = sql.match(/^ALTER TABLE(?: IF EXISTS)? ([\w".]+) ADD COLUMN(?: IF NOT EXISTS)? ([\w"]+)\s+(.+?);?$/i);
  if (match) return { key: `COLUMN:${unquote(match[1])}.${unquote(match[2])}`, mode: 'column-present', table: match[1], column: match[2], sql };
  match = sql.match(/^ALTER TABLE(?: IF EXISTS)? ([\w".]+) DROP COLUMN(?: IF EXISTS)? ([\w"]+)/i);
  if (match) return { key: `COLUMN:${unquote(match[1])}.${unquote(match[2])}`, mode: 'column-absent', table: match[1], column: match[2], sql };
  match = sql.match(/^ALTER TABLE(?: IF EXISTS)? ([\w".]+) (ADD|DROP) CONSTRAINT(?: IF EXISTS)? ([\w"]+)/i);
  if (match) return { key: `CONSTRAINT:${unquote(match[1])}.${unquote(match[3])}`, mode: match[2].toUpperCase() === 'ADD' ? 'constraint-present' : 'constraint-absent', table: match[1], constraint: match[3], sql };
  match = sql.match(/^ALTER TABLE(?: IF EXISTS)? ([\w".]+) ALTER COLUMN ([\w"]+) (ADD GENERATED ALWAYS AS IDENTITY|DROP IDENTITY)/i);
  if (match) return { key: `IDENTITY:${unquote(match[1])}.${unquote(match[2])}`, mode: match[3].toUpperCase().startsWith('ADD') ? 'identity-present' : 'identity-absent', table: match[1], column: match[2], sql };
  match = sql.match(/^DROP TRIGGER(?: IF EXISTS)? ([\w"]+) ON ([\w".]+)/i);
  if (match) return { key: `TRIGGER:${unquote(match[1])}@${unquote(match[2])}`, mode: 'absent', sql };
  // Storage parameters (autovacuum tuning and friends). Matched only when SET is
  // followed by '(' so it cannot swallow SET SCHEMA, SET TABLESPACE, or the
  // ALTER COLUMN ... SET forms. Uses exact mode: the statement counts as folded
  // once the baseline carries it verbatim, and reads as unfolded until then,
  // which is the truth rather than 'unsupported'.
  match = sql.match(/^ALTER TABLE(?: IF EXISTS)? ([\w".]+) SET \(/i);
  if (match) return { key: `STORAGE:${unquote(match[1])}:${compact(sql)}`, mode: 'exact', sql };
  // A routine's configuration (search_path, plan_cache_mode), which a folded
  // baseline carries as a SET clause on that routine's own CREATE FUNCTION.
  // Until 2026-10-04 these were "unsupported", which made the whole report
  // DEGRADED for statements a baseline can be checked against statically.
  // SET ... FROM CURRENT and RESET ALL stay unsupported: their final value
  // depends on the session, not on the text.
  match = sql.match(/^ALTER FUNCTION (.+)$/i);
  if (match) {
    const target = routineTarget(match[1]);
    const setting = target?.rest.match(/^SET ([\w.]+)\s*(?:TO|=)\s*(.+?);?$/i);
    const reset = target?.rest.match(/^RESET ([\w.]+);?$/i);
    const configKey = parameter => `FUNCTION_CONFIG:${target.name}(${target.args.join(',')}):${parameter.toLowerCase()}`;
    if (setting) return { key: configKey(setting[1]), mode: 'function-config', target, parameter: setting[1].toLowerCase(), value: settingValue(setting[2]), sql };
    if (reset && reset[1].toLowerCase() !== 'all') return { key: configKey(reset[1]), mode: 'function-config-reset', target, parameter: reset[1].toLowerCase(), sql };
  }
  match = sql.match(/^DROP POLICY(?: IF EXISTS)? ("(?:[^"]|"")+"|[A-Za-z_][\w$]*) ON ([\w".]+)/i);
  if (match) return { key: `POLICY:${policyName(match[1])}@${unquote(match[2])}`, mode: 'policy-absent', sql };
  if (/^(?:BEGIN|COMMIT);?$/i.test(sql) || /^(?:INSERT|UPDATE|DELETE|SELECT SETVAL)\b/i.test(sql)) return { mode: 'data-only' };
  if (/^SELECT CRON\.SCHEDULE\b/i.test(sql)) return { key: `SCHEDULE:${compact(sql)}`, mode: 'exact', sql };
  if (/^SELECT\s+[\w".]+\s*\(/i.test(sql)) return { mode: 'data-only' };
  if (/^DO\b/i.test(sql)) return { key: `DO:${compact(sql).slice(0, 120)}`, mode: 'semantic-only', sql };
  return null;
}

function reconcileDefinition(key, baselineSql, migrationSql, baselineSource) {
  if (key.startsWith('TABLE:')) {
    const names = [...migrationSql.matchAll(/CONSTRAINT\s+([\w.]+)\s+FOREIGN\s+KEY/gi)].map(match => match[1]);
    const foreignKey = /,?\s*CONSTRAINT\s+[\w.]+\s+FOREIGN\s+KEY\s*\([^)]*\)\s*REFERENCES\s+[\w.]+\s*\([^)]*\)(?:\s+ON\s+(?:DELETE|UPDATE)\s+(?:CASCADE|RESTRICT|NO\s+ACTION|SET\s+NULL|SET\s+DEFAULT))*/gi;
    if (names.length && names.every(name => new RegExp(`CONSTRAINT\\s+${name}\\s+FOREIGN\\s+KEY`, 'i').test(baselineSource)) && compact(migrationSql.replace(foreignKey, '')) === compact(baselineSql)) {
      return `inline FOREIGN KEY hoisted to the constraint block (${names.join(', ')})`;
    }
  }
  if (key.startsWith('TRIGGER:')) {
    // Folding into the baseline REQUIRES adding an idempotency guard. The
    // baseline is the disaster-recovery path and is replayed whole, so the
    // release gate (validate-project.ts step 5, via baseline-rules.mjs)
    // rejects a bare CREATE TRIGGER there. A baseline definition that differs
    // from its incremental ONLY by OR REPLACE is therefore correctly folded,
    // not divergent.
    //
    // WHY THIS IS HERE (2026-09-10, and it cost a run)
    // Without it the two checkers demanded opposite things: the gate required
    // OR REPLACE in the baseline and this checker required verbatim equality
    // with the incremental. Fixing the gate produced a permanently UNFOLDED
    // object whose only available resolution was to revert the gate fix, and
    // Stage 3 attempted precisely that on the 2026-09-10 run: "Consolidated
    // trg_voyage_activation_gate trigger definition in master migration file
    // to match incremental migration verbatim". It would have re-blocked every
    // PWA release, and it would have recurred nightly.
    //
    // Narrow on purpose: OR REPLACE is the only tolerated difference. Anything
    // else stays DIVERGENT.
    const baselineIsIdempotent = /^CREATE\s+OR\s+REPLACE\s+TRIGGER\b/i.test(baselineSql);
    const migrationIsBare = /^CREATE\s+TRIGGER\b/i.test(migrationSql);
    if (baselineIsIdempotent && migrationIsBare) {
      const normalize = sql => compact(sql.replace(/^CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\b/i, 'CREATE TRIGGER'));
      if (normalize(baselineSql) === normalize(migrationSql)) {
        return 'idempotency guard added for baseline replay (OR REPLACE)';
      }
    }
  }
  if (key.startsWith('FUNCTION:')) {
    const pattern = /SET\s+search_path\s+(?:TO|=)\s*([^\n;]+)/i;
    const base = baselineSql.match(pattern);
    const migration = migrationSql.match(pattern);
    if (base && migration) {
      const basePaths = new Set(base[1].split(',').map(item => unquote(item.trim())));
      const migrationPaths = new Set(migration[1].split(',').map(item => unquote(item.trim())));
      if ([...migrationPaths].every(item => basePaths.has(item)) && basePaths.size > migrationPaths.size && compact(baselineSql.replace(pattern, 'SET search_path TO x')) === compact(migrationSql.replace(pattern, 'SET search_path TO x'))) {
        return `search_path normalized to house convention (added ${[...basePaths].filter(item => !migrationPaths.has(item)).sort().join(', ')})`;
      }
    }
  }
  return null;
}

/** Whether a baseline FUNCTION key declares the routine an ALTER FUNCTION names. */
function signatureMatches(key, target) {
  const types = splitArguments(key.slice(`FUNCTION:${target.name}(`.length, -1)).map(normalizeType);
  // Either side may carry an argument name the other does not, and a name
  // cannot be told from the first word of a multi-word type, so a type matches
  // the argument whole or the argument less its first word.
  return types.length === target.args.length
    && types.every((type, index) => type === target.args[index] || type === target.args[index].split(' ').slice(1).join(' '));
}

/** The value a CREATE FUNCTION's own SET clause gives a parameter, or null if it sets none. */
function configuredValue(sql, parameter) {
  // Bodies are dropped first: a SET inside a function body is not the function's.
  const header = sql.replace(/\$([A-Za-z_]\w*)?\$[\s\S]*?\$\1\$/g, ' ');
  const match = header.match(new RegExp(`\\bSET\\s+${parameter.replace('.', '\\.')}\\s*(?:TO|=)\\s*([^\\n;]+)`, 'i'));
  if (!match) return null;
  const value = match[1].split(/\s+(?:AS|LANGUAGE|SECURITY|IMMUTABLE|STABLE|VOLATILE|STRICT|RETURNS|COST|ROWS|PARALLEL|SET)\b/i)[0];
  return settingValue(value);
}

/**
 * A routine configuration against the baseline's CREATE FUNCTION for it.
 *
 * Absent routine: unfolded, because the baseline lacks the routine itself.
 * Ambiguous routine (several overloads, or none matching): semantic-only, a
 * database must decide. That is deliberately never "unfolded": it would send
 * Stage 3 to fold something the checker could not actually identify.
 */
function evaluateFunctionConfig(item, definitions) {
  const candidates = [...definitions.values()].filter(definition => definition.kind === 'FUNCTION' && definition.name === item.target.name);
  if (candidates.length === 0) return 'unfolded';
  const matching = candidates.filter(definition => signatureMatches(definition.key, item.target));
  if (matching.length !== 1) return 'semantic-only';
  const configured = configuredValue(matching[0].sql, item.parameter);
  if (item.mode === 'function-config') return configured === item.value ? 'reconciled' : 'unfolded';
  return configured === null ? 'reconciled' : 'unfolded';
}

function evaluateMutation(item, baselineSource, definitions, exactStatements, baselinePolicies) {
  const tableSql = definitions.get(`TABLE:${unquote(item.table ?? '')}`)?.sql ?? '';
  const columnPattern = item.column ? new RegExp(`(?:^|[(,\\n])\\s*"?${unquote(item.column)}"?\\s+`, 'i') : null;
  const columnSql = item.column ? tableSql.match(new RegExp(`(?:^|[(,\\n])\\s*"?${unquote(item.column)}"?\\s+[^,\\n]+`, 'i'))?.[0] ?? '' : '';
  switch (item.mode) {
    case 'exact': return exactStatements.has(compact(item.sql)) ? 'folded' : 'unfolded';
    case 'absent': return definitions.has(item.key) ? 'unfolded' : 'folded';
    case 'rls': return new RegExp(`ALTER TABLE(?: IF EXISTS)?\\s+${unquote(item.table).replace('.', '\\.')}\\s+ENABLE ROW LEVEL SECURITY`, 'i').test(unquote(baselineSource)) ? 'folded' : 'unfolded';
    case 'column-present': return columnPattern.test(tableSql) ? 'reconciled' : 'unfolded';
    case 'column-absent': return !columnPattern.test(tableSql) ? 'reconciled' : 'unfolded';
    case 'constraint-present': return new RegExp(`CONSTRAINT\\s+"?${unquote(item.constraint)}"?\\s+`, 'i').test(baselineSource) ? 'reconciled' : 'unfolded';
    case 'constraint-absent': return !new RegExp(`CONSTRAINT\\s+"?${unquote(item.constraint)}"?\\s+`, 'i').test(baselineSource) ? 'reconciled' : 'unfolded';
    case 'identity-present': return columnPattern.test(tableSql) && /GENERATED ALWAYS AS IDENTITY/i.test(columnSql) ? 'reconciled' : 'unfolded';
    case 'identity-absent': return columnPattern.test(tableSql) && !/GENERATED ALWAYS AS IDENTITY/i.test(columnSql) ? 'reconciled' : 'unfolded';
    case 'semantic-only': return 'semantic-only';
    case 'function-config':
    case 'function-config-reset': return evaluateFunctionConfig(item, definitions);
    case 'policy-absent': return baselinePolicies.has(item.key) ? 'unfolded' : 'folded';
    default: return 'unsupported';
  }
}

export async function checkFoldState({ migrationsDir = path.join(REPO_ROOT, 'Backend/supabase/migrations') } = {}) {
  const filenames = (await readdir(migrationsDir)).filter(name => name.endsWith('.sql')).sort();
  const baselineName = filenames.find(name => name.startsWith(BASELINE_PREFIX));
  if (!baselineName) throw new Error(`no baseline matching prefix ${BASELINE_PREFIX}`);
  const migrationNames = filenames.filter(name => name !== baselineName);
  const baselineSource = await readFile(path.join(migrationsDir, baselineName), 'utf8');
  const baselineParsed = lexSql(baselineSource);
  if (baselineParsed.error) throw new Error(`baseline: ${baselineParsed.error}`);
  const definitions = new Map();
  for (const statement of baselineParsed.statements) {
    const item = identifyDefinition(statement);
    if (item) definitions.set(item.key, { ...item, sql: statement.executable });
  }
  const exactStatements = new Set(baselineParsed.statements.map(statement => compact(statement.executable)));
  const baselinePolicies = new Set(baselineParsed.statements.map(createdPolicyKey).filter(Boolean));
  const expected = new Map();
  const unsupported = [];
  // A later CREATE or DROP of a routine replaces its whole configuration, so an
  // earlier ALTER FUNCTION ... SET no longer describes the final state. Its
  // expectation is withdrawn; the later statement is checked on its own.
  const supersedeConfig = routineName => {
    for (const key of [...expected.keys()]) {
      if (key.startsWith(`FUNCTION_CONFIG:${routineName}(`)) expected.delete(key);
    }
  };
  for (const filename of migrationNames) {
    const parsed = lexSql(await readFile(path.join(migrationsDir, filename), 'utf8'));
    if (parsed.error) throw new Error(`${filename}: ${parsed.error}`);
    for (const statement of parsed.statements) {
      const item = identifyDefinition(statement);
      if (item) {
        if (item.kind === 'FUNCTION') supersedeConfig(item.name);
        expected.set(item.key, { ...item, mode: 'definition', sql: statement.executable, source: filename });
      } else {
        const operation = mutation(statement);
        if (!operation) unsupported.push({ source: filename, statement: compact(statement.executable).slice(0, 160) });
        else if (operation.mode !== 'data-only') {
          if (operation.key?.startsWith('FUNCTION:') && operation.mode === 'absent') supersedeConfig(operation.key.slice('FUNCTION:'.length));
          expected.set(operation.key, { ...operation, source: filename });
        }
      }
    }
  }

  const objects = [];
  for (const [key, item] of [...expected].sort(([left], [right]) => left.localeCompare(right))) {
    if (item.mode === 'definition') {
      const baseline = definitions.get(key);
      if (!baseline) objects.push({ key, source: item.source, status: 'unfolded', reason: 'ABSENT' });
      else if (compactDefinition(baseline.sql) === compactDefinition(item.sql)) objects.push({ key, source: item.source, status: 'folded' });
      else {
        const reason = reconcileDefinition(key, baseline.sql, item.sql, baselineSource);
        objects.push(reason ? { key, source: item.source, status: 'reconciled', reason } : { key, source: item.source, status: 'unfolded', reason: 'DIVERGENT' });
      }
    } else {
      const status = evaluateMutation(item, baselineSource, definitions, exactStatements, baselinePolicies);
      const routineAbsent = item.mode.startsWith('function-config')
        && ![...definitions.values()].some(definition => definition.kind === 'FUNCTION' && definition.name === item.target.name);
      objects.push({
        key,
        source: item.source,
        status,
        reason: status === 'reconciled' ? `declarative ${item.mode}` : status === 'unfolded' ? (routineAbsent ? 'ABSENT' : 'DIVERGENT') : undefined,
      });
    }
  }
  const counts = Object.fromEntries(['folded', 'reconciled', 'unfolded', 'semantic-only'].map(status => [status, objects.filter(item => item.status === status).length]));
  // UNFOLDED outranks DEGRADED, because known folding work is actionable and
  // must never be hidden behind what a database still has to confirm.
  //
  // It used to be the other way round, and that hid real work for weeks. From
  // 2026-09-14 the migrations held DO blocks, so every report was DEGRADED and
  // exited 2, and update-nightly-context.sh only lists pending migrations on
  // exit 1. Stage 3 was told "0 pending migrations" every night while 74
  // objects from about 30 migrations went unfolded into the baseline.
  //
  // DEGRADED now means only that nothing is known to need folding but a
  // database still has to look (a DO block, an ambiguous routine). The
  // nightly runner has no database (Stage 3 records DB-UNAVAILABLE), so that
  // is a ceiling here, and the semantic check runs in CI on Stage 3's pull
  // request instead (nightly-database-verification.yml).
  const status = counts.unfolded ? 'UNFOLDED' : unsupported.length || counts['semantic-only'] ? 'DEGRADED' : 'FOLDED';
  return { version: 1, status, baseline: baselineName, migrationsReplayed: migrationNames.length, counts, objects, unsupported };
}

function printHuman(report) {
  console.log(`baseline:              ${report.baseline}`);
  console.log(`migrations replayed:   ${report.migrationsReplayed}`);
  console.log(`final-state objects:   ${report.objects.length}`);
  console.log(`folded verbatim:       ${report.counts.folded}`);
  console.log(`folded + reconciled:   ${report.counts.reconciled}`);
  console.log(`semantic-only:         ${report.counts['semantic-only']}`);
  console.log(`unfolded:              ${report.counts.unfolded}\n`);
  for (const item of report.objects.filter(item => item.status === 'reconciled')) console.log(`RECONCILED ${item.key} ${item.reason}\n           <- ${item.source}`);
  const semantic = report.objects.filter(item => item.status === 'semantic-only');
  const printSemantic = () => {
    for (const item of semantic) console.log(`  SEMANTIC ${item.key} <- ${item.source}`);
    for (const item of report.unsupported) console.log(`  UNSUPPORTED ${item.statement} <- ${item.source}`);
  };
  if (report.status === 'FOLDED') console.log('RESULT: FOLDED -- baseline is current, no folding work pending.');
  else if (report.status === 'UNFOLDED') {
    console.log('RESULT: UNFOLDED -- the following objects need folding:');
    for (const item of report.objects.filter(item => item.status === 'unfolded')) console.log(`  ${item.reason.padEnd(10)} ${item.key} <- ${item.source}`);
    console.log('\nMigrations owning unfolded objects:');
    for (const source of [...new Set(report.objects.filter(item => item.status === 'unfolded').map(item => item.source))].sort()) console.log(`  ${source}`);
    // Still printed, because folding the list above does not make these
    // checkable: they remain for a database to confirm once it is done.
    if (semantic.length || report.unsupported.length) {
      console.log('\nAlso awaiting semantic database verification:');
      printSemantic();
    }
  } else {
    console.log('RESULT: DEGRADED -- static analysis requires semantic database verification.');
    printSemantic();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const positional = process.argv.slice(2).find(value => !value.startsWith('--'));
    const report = await checkFoldState({ migrationsDir: positional ? path.resolve(positional) : undefined });
    if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
    else printHuman(report);
    process.exitCode = report.status === 'FOLDED' ? 0 : report.status === 'UNFOLDED' ? 1 : 2;
  } catch (error) {
    const degraded = { version: 1, status: 'DEGRADED', error: `${error.name}: ${error.message}` };
    if (process.argv.includes('--json')) console.log(JSON.stringify(degraded, null, 2));
    else console.error(`fold-state: check could not complete (${degraded.error})`);
    process.exitCode = 2;
  }
}
