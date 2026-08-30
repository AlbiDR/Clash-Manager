#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { lexSql, topLevelCommentLines } from './sql-lexer.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..');
const POLICY_PATH = path.join(REPO_ROOT, '.github', 'nightly-config', 'migration-quality.json');

function normalizedName(value) {
  return value.replaceAll('"', '').toLowerCase();
}

function statementHead(statement) {
  return statement.executable.replace(/\s+/g, ' ').trim();
}

function splitTopLevel(value) {
  const parts = [];
  let depth = 0;
  let start = 0;
  let quote = null;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (quote) {
      if (char === quote && value[index + 1] === quote) index += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"') quote = char;
    else if (char === '(' || char === '[') depth += 1;
    else if (char === ')' || char === ']') depth -= 1;
    else if (char === ',' && depth === 0) {
      parts.push(value.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(value.slice(start));
  return parts;
}

function functionDefinition(sql) {
  const head = sql.match(/^CREATE(?: OR REPLACE)? FUNCTION ([\w".]+)\s*\(/i);
  if (!head) return null;
  const opening = head[0].lastIndexOf('(');
  let depth = 0;
  let closing = -1;
  for (let index = opening + 1; index < sql.length; index += 1) {
    if (sql[index] === '(') depth += 1;
    else if (sql[index] === ')' && depth === 0) {
      closing = index;
      break;
    } else if (sql[index] === ')') depth -= 1;
  }
  if (closing < 0) return null;
  const signature = splitTopLevel(sql.slice(opening + 1, closing)).filter(item => item.trim()).map(argument => {
    const withoutDefault = argument.replace(/\s+(?:DEFAULT\s+|=).+$/i, '').trim();
    const withoutMode = withoutDefault.replace(/^(?:INOUT|IN|OUT|VARIADIC)\s+/i, '');
    const tokens = withoutMode.split(/\s+/);
    if (tokens.length > 1 && /^"?[A-Za-z_][\w$]*"?$/.test(tokens[0])) tokens.shift();
    return tokens.join(' ').toLowerCase();
  }).join(',');
  const name = normalizedName(head[1]);
  return { kind: 'FUNCTION', key: `FUNCTION:${name}(${signature})`, name, sql };
}

export function identifyDefinition(statement) {
  const sql = statementHead(statement);
  const routine = functionDefinition(sql);
  if (routine) return routine;
  const patterns = [
    ['SCHEMA', /^CREATE SCHEMA(?: IF NOT EXISTS)? ([\w".]+)/i],
    ['EXTENSION', /^CREATE EXTENSION(?: IF NOT EXISTS)? ([\w".]+)/i],
    ['TYPE', /^CREATE TYPE ([\w".]+)/i],
    ['TABLE', /^CREATE TABLE(?: IF NOT EXISTS)? ([\w".]+)/i],
    ['MATERIALIZED_VIEW', /^CREATE MATERIALIZED VIEW(?: IF NOT EXISTS)? ([\w".]+)/i],
    ['VIEW', /^CREATE(?: OR REPLACE)? VIEW ([\w".]+)/i],
    ['INDEX', /^CREATE(?: UNIQUE)? INDEX(?: IF NOT EXISTS)? ([\w".]+)/i],
    ['TRIGGER', /^CREATE(?: OR REPLACE)? TRIGGER ([\w"]+).*?\bON\s+([\w".]+)/i],
    ['POLICY', /^CREATE POLICY ([\w"]+) ON ([\w".]+)/i],
  ];
  for (const [kind, pattern] of patterns) {
    const match = sql.match(pattern);
    if (!match) continue;
    const suffix = match[2] ? `@${normalizedName(match[2])}` : '';
    return { kind, key: `${kind}:${normalizedName(match[1])}${suffix}`, name: normalizedName(match[1]), sql };
  }
  return null;
}

function validatePolicy(policy, migrationPaths) {
  const errors = [];
  if (policy.version !== 1) errors.push('policy version must be 1');
  const seen = new Set();
  const immutablePaths = new Set(Object.keys(policy.immutableFileHashes ?? {}));
  for (const migrationPath of migrationPaths) {
    if (migrationPath !== policy.baseline && !immutablePaths.has(migrationPath)) {
      errors.push(`incremental migration is not registered as immutable: ${migrationPath}`);
    }
  }
  for (const [migrationPath, hash] of Object.entries(policy.immutableFileHashes ?? {})) {
    if (!migrationPaths.has(migrationPath)) errors.push(`immutable migration path does not exist: ${migrationPath}`);
    if (!/^[a-f0-9]{64}$/.test(hash)) errors.push(`invalid immutable migration hash: ${migrationPath}`);
  }
  for (const exemption of policy.exemptions ?? []) {
    const fields = ['path', 'reason', 'maxCommentLines', 'maxCommentRatio', 'expiresOn'];
    if (fields.some(field => exemption[field] === undefined)) {
      errors.push(`exemption is missing required fields: ${JSON.stringify(exemption)}`);
      continue;
    }
    if (seen.has(exemption.path)) errors.push(`duplicate exemption: ${exemption.path}`);
    seen.add(exemption.path);
    if (!migrationPaths.has(exemption.path)) errors.push(`exemption path does not exist: ${exemption.path}`);
    if (String(exemption.reason).trim().length < 20) errors.push(`exemption reason is too short: ${exemption.path}`);
    if (!Number.isInteger(exemption.maxCommentLines) || exemption.maxCommentLines > 40) {
      errors.push(`exemption maxCommentLines must be an integer no greater than 40: ${exemption.path}`);
    }
    if (typeof exemption.maxCommentRatio !== 'number' || exemption.maxCommentRatio > 0.8) {
      errors.push(`exemption maxCommentRatio must be no greater than 0.8: ${exemption.path}`);
    }
    const expiry = /^\d{4}-\d{2}-\d{2}$/.test(exemption.expiresOn)
      ? new Date(`${exemption.expiresOn}T00:00:00Z`)
      : null;
    if (!expiry || Number.isNaN(expiry.valueOf())) errors.push(`invalid exemption expiry: ${exemption.path}`);
    else if (expiry < new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z')) {
      errors.push(`expired exemption: ${exemption.path}`);
    }
  }
  return errors;
}

function inspectBaseline(source, policy) {
  const parsed = lexSql(source);
  const violations = [];
  const unsupportedStatements = [];
  if (parsed.error) return { violations: [parsed.error], unsupportedStatements, definitions: [] };

  const definitions = parsed.statements.map(identifyDefinition).filter(Boolean);
  const duplicates = new Map();
  for (const item of definitions) duplicates.set(item.key, (duplicates.get(item.key) ?? 0) + 1);
  for (const [key, count] of duplicates) {
    if (count > 1) violations.push(`duplicate baseline definition: ${key}`);
  }

  const tables = definitions.filter(item => item.kind === 'TABLE').map(item => item.name);
  const policyTables = new Set(definitions.filter(item => item.kind === 'POLICY').map(item => item.key.split('@')[1]));
  const compact = parsed.statements.map(statementHead);
  for (const table of tables) {
    const escaped = table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!compact.some(sql => new RegExp(`^ALTER TABLE(?: IF EXISTS)? ${escaped} ENABLE ROW LEVEL SECURITY`, 'i').test(normalizedName(sql)))) {
      violations.push(`RLS is not enabled for table ${table}`);
    }
    const directApplicationGrant = compact.some(sql => {
      const grant = sql.match(/^GRANT\s+(.+?)\s+ON\s+(?:TABLE\s+)?([\w".]+)\s+TO\s+(.+?);?$/i);
      return grant
        && normalizedName(grant[2]) === table
        && /\b(?:anon|authenticated)\b/i.test(grant[3]);
    });
    if (directApplicationGrant && !policyTables.has(table)) {
      violations.push(`application roles can access ${table} directly but it has no RLS policy`);
    }
  }

  for (const item of definitions.filter(item => ['TABLE', 'FUNCTION', 'VIEW', 'MATERIALIZED_VIEW'].includes(item.kind))) {
    if (!item.name.includes('.')) violations.push(`definition is not schema-qualified: ${item.key}`);
    if (item.kind === 'FUNCTION' && !/\bSET search_path\s*(?:TO|=)/i.test(item.sql)) {
      violations.push(`function has no explicit search_path: ${item.key}`);
    }
  }

  for (const sql of compact) {
    const head = sql.match(/^([A-Z]+(?:\s+[A-Z]+)?)/i)?.[1]?.toUpperCase() ?? '';
    if (/^(UPDATE|DELETE)\b/i.test(sql)) violations.push(`top-level historical repair statement is forbidden: ${head}`);
    const insert = sql.match(/^INSERT INTO ([\w".]+)/i);
    if (insert && !policy.allowedSeedTargets.map(normalizedName).includes(normalizedName(insert[1]))) {
      violations.push(`seed target is not allowlisted: ${normalizedName(insert[1])}`);
    }
    if (!/^(CREATE|ALTER|DROP|COMMENT|GRANT|REVOKE|INSERT|DO|SELECT|BEGIN|COMMIT)\b/i.test(sql)) {
      unsupportedStatements.push(sql.slice(0, 120));
    }
    if (/^GRANT\s+ALL(?:\s+PRIVILEGES)?\b/i.test(sql)) {
      violations.push('GRANT ALL violates least-privilege baseline policy');
    }
  }

  for (const [index, sql] of compact.entries()) {
    const dropped = sql.match(/^DROP (TABLE|VIEW|MATERIALIZED VIEW|FUNCTION|TYPE|INDEX)(?: IF EXISTS)? ([\w".]+)/i);
    if (!dropped) continue;
    const kind = dropped[1].replace(' ', '_').toUpperCase();
    const name = normalizedName(dropped[2]);
    const recreated = parsed.statements.slice(index + 1)
      .map(identifyDefinition)
      .filter(Boolean)
      .some(item => item.kind === kind && item.name === name);
    if (!recreated) violations.push(`stale destructive residue has no later declarative definition: ${kind}:${name}`);
  }

  const order = { EXTENSION: 0, SCHEMA: 0, TYPE: 1, TABLE: 2, FUNCTION: 4, VIEW: 5, MATERIALIZED_VIEW: 5, TRIGGER: 6 };
  let last = -1;
  for (const item of definitions.filter(item => order[item.kind] !== undefined)) {
    if (order[item.kind] < last) violations.push(`definition is out of dependency section order: ${item.key}`);
    last = Math.max(last, order[item.kind]);
  }

  return { violations: [...new Set(violations)], unsupportedStatements, definitions };
}

export async function auditMigrations({ repoRoot = REPO_ROOT } = {}) {
  const policy = JSON.parse(await readFile(path.join(repoRoot, path.relative(REPO_ROOT, POLICY_PATH)), 'utf8'));
  const migrationsDir = path.join(repoRoot, 'Backend', 'supabase', 'migrations');
  const filenames = (await readdir(migrationsDir)).filter(name => name.endsWith('.sql')).sort();
  const paths = filenames.map(name => path.posix.join('Backend/supabase/migrations', name));
  const policyErrors = validatePolicy(policy, new Set(paths));
  const exemptionByPath = new Map((policy.exemptions ?? []).map(item => [item.path, item]));
  const migrations = [];

  for (const [index, filename] of filenames.entries()) {
    const relativePath = paths[index];
    const source = await readFile(path.join(migrationsDir, filename), 'utf8');
    const parsed = lexSql(source);
    const lines = source.split('\n');
    const commentLines = topLevelCommentLines(source, parsed.comments);
    const nonblankLines = lines.filter(line => line.trim()).length;
    const statementCount = parsed.statements.length;
    const exemption = exemptionByPath.get(relativePath);
    const defaultMax = statementCount <= policy.budgets.smallStatementLimit
      ? policy.budgets.smallCommentLines
      : policy.budgets.largeCommentLines;
    const maxCommentLines = exemption?.maxCommentLines ?? defaultMax;
    const maxCommentRatio = exemption?.maxCommentRatio ?? policy.budgets.maximumCommentRatio;
    const commentRatio = nonblankLines === 0 ? 0 : commentLines.length / nonblankLines;
    const violations = [];
    if (parsed.error) violations.push(parsed.error);
    if (relativePath !== policy.baseline) {
      const expectedHash = policy.immutableFileHashes?.[relativePath];
      const actualHash = createHash('sha256').update(source).digest('hex');
      if (expectedHash && actualHash !== expectedHash) violations.push('historical migration file differs from its immutable hash');
      if (commentLines.length > maxCommentLines) violations.push(`comment lines ${commentLines.length} exceed ${maxCommentLines}`);
      if (nonblankLines >= policy.budgets.ratioMinimumNonblankLines && commentRatio > maxCommentRatio) {
        violations.push(`comment ratio ${commentRatio.toFixed(3)} exceeds ${maxCommentRatio}`);
      }
    }
    migrations.push({
      path: relativePath,
      statementCount,
      nonblankLines,
      topLevelCommentLines: commentLines.length,
      commentRatio: Number(commentRatio.toFixed(4)),
      exemption: exemption ? { reason: exemption.reason, expiresOn: exemption.expiresOn } : null,
      violations,
    });
  }

  const baselineSource = await readFile(path.join(repoRoot, policy.baseline), 'utf8');
  const baseline = inspectBaseline(baselineSource, policy);
  const violationCount = policyErrors.length + baseline.violations.length
    + migrations.reduce((count, migration) => count + migration.violations.length, 0);
  const degraded = baseline.unsupportedStatements.length > 0;
  return {
    version: 1,
    status: violationCount > 0 ? 'FAIL' : degraded ? 'DEGRADED' : 'PASS',
    baseline: policy.baseline,
    verificationLevel: 'STATIC',
    summary: {
      migrationsExamined: migrations.length - 1,
      baselineObjects: baseline.definitions.length,
      violations: violationCount,
      unsupportedStatements: baseline.unsupportedStatements.length,
    },
    policyErrors,
    migrations,
    baseline: { path: policy.baseline, violations: baseline.violations },
    unsupportedStatements: baseline.unsupportedStatements,
  };
}

function printHuman(report) {
  console.log(`Migration audit: ${report.status}`);
  console.log(`Baseline: ${report.baseline.path}`);
  console.log(`Migrations examined: ${report.summary.migrationsExamined}`);
  console.log(`Baseline objects: ${report.summary.baselineObjects}`);
  console.log(`Violations: ${report.summary.violations}`);
  console.log(`Unsupported statements: ${report.summary.unsupportedStatements}`);
  for (const error of report.policyErrors) console.log(`POLICY: ${error}`);
  for (const error of report.baseline.violations) console.log(`BASELINE: ${error}`);
  for (const migration of report.migrations) {
    for (const error of migration.violations) console.log(`${migration.path}: ${error}`);
  }
  for (const statement of report.unsupportedStatements) console.log(`UNSUPPORTED: ${statement}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const report = await auditMigrations();
    if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
    else printHuman(report);
    process.exitCode = report.status === 'PASS' ? 0 : report.status === 'FAIL' ? 1 : 2;
  } catch (error) {
    const report = { version: 1, status: 'DEGRADED', error: `${error.name}: ${error.message}` };
    if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
    else console.error(`Migration audit degraded: ${report.error}`);
    process.exitCode = 2;
  }
}
