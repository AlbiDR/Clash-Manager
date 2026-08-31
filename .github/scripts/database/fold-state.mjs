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
  if (/^(?:BEGIN|COMMIT);?$/i.test(sql) || /^(?:INSERT|UPDATE|DELETE|SELECT SETVAL)\b/i.test(sql)) return { mode: 'data-only' };
  if (/^SELECT CRON\.SCHEDULE\b/i.test(sql)) return { key: `SCHEDULE:${compact(sql)}`, mode: 'exact', sql };
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

function evaluateMutation(item, baselineSource, definitions, exactStatements) {
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
  const expected = new Map();
  const unsupported = [];
  for (const filename of migrationNames) {
    const parsed = lexSql(await readFile(path.join(migrationsDir, filename), 'utf8'));
    if (parsed.error) throw new Error(`${filename}: ${parsed.error}`);
    for (const statement of parsed.statements) {
      const item = identifyDefinition(statement);
      if (item) expected.set(item.key, { ...item, mode: 'definition', sql: statement.executable, source: filename });
      else {
        const operation = mutation(statement);
        if (!operation) unsupported.push({ source: filename, statement: compact(statement.executable).slice(0, 160) });
        else if (operation.mode !== 'data-only') expected.set(operation.key, { ...operation, source: filename });
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
      const status = evaluateMutation(item, baselineSource, definitions, exactStatements);
      objects.push({
        key,
        source: item.source,
        status,
        reason: status === 'reconciled' ? `declarative ${item.mode}` : status === 'unfolded' ? 'DIVERGENT' : undefined,
      });
    }
  }
  const counts = Object.fromEntries(['folded', 'reconciled', 'unfolded', 'semantic-only'].map(status => [status, objects.filter(item => item.status === status).length]));
  const status = unsupported.length || counts['semantic-only'] ? 'DEGRADED' : counts.unfolded ? 'UNFOLDED' : 'FOLDED';
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
  if (report.status === 'FOLDED') console.log('RESULT: FOLDED -- baseline is current, no folding work pending.');
  else if (report.status === 'UNFOLDED') {
    console.log('RESULT: UNFOLDED -- the following objects need folding:');
    for (const item of report.objects.filter(item => item.status === 'unfolded')) console.log(`  ${item.reason.padEnd(10)} ${item.key} <- ${item.source}`);
    console.log('\nMigrations owning unfolded objects:');
    for (const source of [...new Set(report.objects.filter(item => item.status === 'unfolded').map(item => item.source))].sort()) console.log(`  ${source}`);
  } else {
    console.log('RESULT: DEGRADED -- static analysis requires semantic database verification.');
    for (const item of report.objects.filter(item => item.status === 'semantic-only')) console.log(`  SEMANTIC ${item.key} <- ${item.source}`);
    for (const item of report.unsupported) console.log(`  UNSUPPORTED ${item.statement} <- ${item.source}`);
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
