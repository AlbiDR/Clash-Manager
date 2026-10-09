// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { lexSql, topLevelCommentLines } from './sql-lexer.mjs';
import { baselineDdlViolations } from './baseline-rules.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..", "..", "..");
const POLICY_PATH = path.join(REPO_ROOT, '.github', 'nightly-config', 'migration-quality.json');

function normalizedName(value) {
  return value.trim().replaceAll('"', '').toLowerCase();
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

function topLevelKeywordIndex(source, keyword) {
  let depth = 0;
  let quote = null;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (char === quote && source[index + 1] === quote) index += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"') quote = char;
    else if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
    else if (depth === 0 && source.slice(index, index + keyword.length).toUpperCase() === keyword
      && !/[\w$]/.test(source[index - 1] ?? '')
      && !/[\w$]/.test(source[index + keyword.length] ?? '')) return index;
  }
  return -1;
}

function normalizedIdentifier(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replaceAll('""', '"');
  }
  return trimmed.toLowerCase();
}

function sqlIdentifierAt(source, start) {
  let index = start;
  while (/\s/.test(source[index] ?? '')) index += 1;
  const tokenStart = index;
  let value;
  if (source[index] === '"') {
    index += 1;
    let closed = false;
    while (index < source.length) {
      if (source[index] === '"' && source[index + 1] === '"') index += 2;
      else if (source[index] === '"') {
        index += 1;
        closed = true;
        break;
      } else index += 1;
    }
    if (!closed) return null;
    value = normalizedIdentifier(source.slice(tokenStart, index));
  } else {
    const match = source.slice(index).match(/^[A-Za-z_][A-Za-z0-9_$]*/);
    if (!match) return null;
    index += match[0].length;
    value = match[0].toLowerCase();
  }
  return { end: index, value };
}

function qualifiedViewIdentifierAt(source, start) {
  let index = start;
  const parts = [];
  while (true) {
    const part = sqlIdentifierAt(source, index);
    if (!part) return null;
    parts.push(part.value);
    index = part.end;
    while (/\s/.test(source[index] ?? '')) index += 1;
    if (source[index] !== '.') break;
    index += 1;
  }
  return {
    end: index,
    key: JSON.stringify(parts),
    name: parts.map(part => /^[a-z_][a-z0-9_$]*$/.test(part) ? part : `"${part.replaceAll('"', '""')}"`).join('.'),
  };
}

function matchingParen(source, open) {
  let depth = 0;
  let quote = null;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (char === quote && source[index + 1] === quote) index += 1;
      else if (char === quote) quote = null;
    } else if (char === "'" || char === '"') quote = char;
    else if (char === '(') depth += 1;
    else if (char === ')' && --depth === 0) return index;
  }
  return -1;
}

function cteOutputColumns(query, mainSelectIndex) {
  const prefix = query.slice(0, mainSelectIndex);
  const withHead = prefix.match(/^WITH\s+(?:RECURSIVE\s+)?/i);
  if (!withHead) return new Map();
  const definitions = new Map();
  let cursor = withHead[0].length;
  while (cursor < prefix.length) {
    const name = sqlIdentifierAt(prefix, cursor);
    if (!name) return new Map();
    cursor = name.end;
    while (/\s/.test(prefix[cursor] ?? '')) cursor += 1;
    let explicitNames = null;
    if (prefix[cursor] === '(') {
      const close = matchingParen(prefix, cursor);
      if (close < 0) return new Map();
      explicitNames = splitTopLevel(prefix.slice(cursor + 1, close)).map(item => {
        const part = sqlIdentifierAt(item, 0);
        return part && !item.slice(part.end).trim() ? part.value : null;
      });
      if (explicitNames.length === 0 || explicitNames.some(item => !item)) return new Map();
      cursor = close + 1;
      while (/\s/.test(prefix[cursor] ?? '')) cursor += 1;
    }
    const asHead = prefix.slice(cursor).match(/^AS\s+(?:(?:NOT\s+)?MATERIALIZED\s+)?\(/i);
    if (!asHead) return new Map();
    const open = cursor + asHead[0].lastIndexOf('(');
    const close = matchingParen(prefix, open);
    if (close < 0) return new Map();
    let columns = viewSelectProjection(prefix.slice(open + 1, close));
    if (explicitNames) {
      if (!columns || columns.length !== explicitNames.length) columns = null;
      else columns = explicitNames;
    }
    if (columns?.some(item => !item)) columns = null;
    definitions.set(name.value, columns);
    cursor = close + 1;
    while (/\s/.test(prefix[cursor] ?? '')) cursor += 1;
    if (prefix[cursor] !== ',') break;
    cursor += 1;
    while (/\s/.test(prefix[cursor] ?? '')) cursor += 1;
  }
  return definitions;
}

function soleCteSourceColumns(query, fromIndex, ctes) {
  if (fromIndex < 0) return null;
  const source = query.slice(fromIndex + 'FROM'.length).trim().replace(/;$/, '').trim();
  const relation = sqlIdentifierAt(source, 0);
  if (!relation || source.slice(relation.end).trim()) return null;
  return ctes.get(relation.value) || null;
}

function viewSelectProjection(query) {
  const selectIndex = topLevelKeywordIndex(query, 'SELECT');
  if (selectIndex < 0) return null;
  const projectionStart = selectIndex + 'SELECT'.length;
  const fromRelativeIndex = topLevelKeywordIndex(query.slice(projectionStart), 'FROM');
  const fromIndex = fromRelativeIndex < 0 ? -1 : projectionStart + fromRelativeIndex;
  const projectionEnd = fromIndex < 0 ? query.length : fromIndex;
  const expressions = splitTopLevel(query.slice(projectionStart, projectionEnd).trim());
  if (expressions.length === 0) return null;
  const ctes = cteOutputColumns(query, selectIndex);
  const sourceColumns = soleCteSourceColumns(query, fromIndex, ctes);
  const columns = [];
  for (const expression of expressions) {
    const trimmed = expression.trim();
    if (trimmed === '*') {
      if (!sourceColumns) return null;
      columns.push(...sourceColumns);
      continue;
    }
    if (/(?:^|\.)\s*\*$/.test(trimmed)) return null;
    const alias = expression.match(/\s+AS\s+("(?:""|[^"])+"|[A-Za-z_][\w$]*)\s*$/i);
    if (alias) {
      columns.push(normalizedIdentifier(alias[1]));
      continue;
    }
    const reference = expression.trim().match(/^(?:(?:"(?:""|[^"])+"|[A-Za-z_][\w$]*)\s*\.\s*)*("(?:""|[^"])+"|[A-Za-z_][\w$]*)$/);
    columns.push(reference ? normalizedIdentifier(reference[1].split('.').at(-1)) : null);
  }
  return columns;
}

function simpleViewProjection(sql) {
  sql = sql.replace(/;\s*$/, '');
  const head = sql.match(/^CREATE\s+(OR\s+REPLACE\s+)?VIEW\s+/i);
  if (!head) return null;
  const identifier = qualifiedViewIdentifierAt(sql, head[0].length);
  if (!identifier) return null;
  let cursor = identifier.end;
  while (/\s/.test(sql[cursor] ?? '')) cursor += 1;

  let explicitColumns = null;
  if (sql[cursor] === '(') {
    const close = matchingParen(sql, cursor);
    if (close < 0) return null;
    explicitColumns = splitTopLevel(sql.slice(cursor + 1, close)).map(column => {
      const name = sqlIdentifierAt(column, 0);
      return name && !column.slice(name.end).trim() ? name.value : null;
    });
    if (explicitColumns.length === 0 || explicitColumns.some(column => !column)) return null;
    cursor = close + 1;
    while (/\s/.test(sql[cursor] ?? '')) cursor += 1;
  }

  if (/^WITH\s*\(/i.test(sql.slice(cursor))) {
    const open = sql.indexOf('(', cursor + 'WITH'.length);
    const close = matchingParen(sql, open);
    if (open < 0 || close < 0) return null;
    cursor = close + 1;
  }
  const asOffset = topLevelKeywordIndex(sql.slice(cursor), 'AS');
  if (asOffset < 0) return null;
  const query = sql.slice(cursor + asOffset + 2).trim();
  const projectedColumns = viewSelectProjection(query);
  let columns = projectedColumns && projectedColumns.every(Boolean) ? projectedColumns : null;
  if (explicitColumns) {
    if (!projectedColumns || projectedColumns.length !== explicitColumns.length) columns = null;
    else columns = explicitColumns;
  }
  return { key: identifier.key, name: identifier.name, replace: Boolean(head[1]), columns, query };
}

function dropViewIdentifiers(sql) {
  const head = sql.match(/^DROP\s+VIEW\s+(?:IF\s+EXISTS\s+)?/i);
  if (!head) return null;
  let cursor = head[0].length;
  const identifiers = [];
  while (cursor < sql.length) {
    while (/\s/.test(sql[cursor] ?? '')) cursor += 1;
    const identifier = qualifiedViewIdentifierAt(sql, cursor);
    if (!identifier) return null;
    identifiers.push(identifier);
    cursor = identifier.end;
    while (/\s/.test(sql[cursor] ?? '')) cursor += 1;
    if (sql[cursor] !== ',') break;
    cursor += 1;
  }
  const suffix = sql.slice(cursor).trim().replace(/;$/, '').trim();
  if (!identifiers.length || (suffix && !/^(?:CASCADE|RESTRICT)$/i.test(suffix))) return null;
  return { identifiers, cascade: /^CASCADE$/i.test(suffix) };
}

function trackedViewReferences(query, views) {
  const references = new Set();
  for (let index = 0; index < query.length; index += 1) {
    if (query[index] === "'") {
      index += 1;
      while (index < query.length) {
        if (query[index] === "'" && query[index + 1] === "'") index += 2;
        else if (query[index] === "'") break;
        else index += 1;
      }
      continue;
    }
    if (query[index] === '"') {
      index += 1;
      while (index < query.length) {
        if (query[index] === '"' && query[index + 1] === '"') index += 2;
        else if (query[index] === '"') break;
        else index += 1;
      }
      continue;
    }
    if (query[index] === '$') {
      const tag = query.slice(index).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0];
      if (tag) {
        const end = query.indexOf(tag, index + tag.length);
        if (end >= 0) {
          index = end + tag.length - 1;
          continue;
        }
      }
    }
    const keyword = ['FROM', 'JOIN'].find(candidate =>
      query.slice(index, index + candidate.length).toUpperCase() === candidate
      && !/[\w$]/.test(query[index - 1] ?? '')
      && !/[\w$]/.test(query[index + candidate.length] ?? ''),
    );
    if (!keyword) continue;
    let cursor = index + keyword.length;
    while (/\s/.test(query[cursor] ?? '')) cursor += 1;
    const only = query.slice(cursor).match(/^ONLY\b/i);
    if (only) {
      cursor += only[0].length;
      while (/\s/.test(query[cursor] ?? '')) cursor += 1;
    }
    const identifier = qualifiedViewIdentifierAt(query, cursor);
    if (identifier && views.has(identifier.key)) references.add(identifier.key);
  }
  return [...references];
}

/**
 * PostgreSQL allows CREATE OR REPLACE VIEW to append output columns, but not
 * remove, rename, or reorder columns already present. A folded baseline may
 * therefore make an otherwise valid retained historical migration fail on a
 * fresh replay. Compare statically recognizable view projections in replay
 * order so the migration audit catches that incompatibility without Docker.
 */
export function incompatibleViewReplacementViolations(sources) {
  const views = new Map();
  const violations = [];
  for (const { path: sourcePath, source } of sources) {
    const parsed = lexSql(source);
    if (parsed.error) {
      violations.push(`${sourcePath}: cannot inspect view history after SQL lexer error: ${parsed.error}`);
      continue;
    }
    for (const statement of parsed.statements) {
      const sql = statementHead(statement);
      if (/^DROP\s+VIEW\b/i.test(sql)) {
        const dropped = dropViewIdentifiers(sql);
        if (!dropped) {
          violations.push(`${sourcePath}: cannot model ordinary DROP VIEW statement: ${sql.slice(0, 120)}`);
          continue;
        }
        const removed = new Set(dropped.identifiers.map(identifier => identifier.key));
        if (dropped.cascade) {
          let changed = true;
          while (changed) {
            changed = false;
            for (const [key, view] of views) {
              if (!removed.has(key) && view.dependencies.some(dependency => removed.has(dependency))) {
                removed.add(key);
                changed = true;
              }
            }
          }
        }
        for (const key of removed) views.delete(key);
        continue;
      }
      if (/^ALTER\s+VIEW\b/i.test(sql)) {
        violations.push(`${sourcePath}: cannot model ALTER VIEW output history: ${sql.slice(0, 120)}`);
        continue;
      }
      const alterTable = sql.match(/^ALTER\s+TABLE\s+(?:ONLY\s+)?/i);
      if (alterTable) {
        const identifier = qualifiedViewIdentifierAt(sql, alterTable[0].length);
        if (identifier && views.has(identifier.key)) {
          violations.push(`${sourcePath}: cannot model ALTER TABLE changes to tracked view ${identifier.name}`);
          continue;
        }
      }
      const isViewCreate = /^CREATE\s+(?:OR\s+REPLACE\s+)?(?:(?:TEMP|TEMPORARY)\s+)?VIEW\b/i.test(sql);
      const next = simpleViewProjection(sql);
      if (!next) {
        if (isViewCreate) violations.push(`${sourcePath}: cannot prove ordinary CREATE VIEW output contract: ${sql.slice(0, 120)}`);
        continue;
      }
      if (!next.columns) {
        violations.push(`${sourcePath}: cannot prove ordinary CREATE VIEW output columns for ${next.name}`);
      }
      const previous = views.get(next.key);
      if (next.replace && previous) {
        if (!previous.columns || !next.columns) {
          violations.push(`${sourcePath}: cannot prove CREATE OR REPLACE VIEW ${next.name} preserves its prior output columns`);
        } else if (next.columns.length < previous.columns.length
          || previous.columns.some((column, index) => next.columns[index] !== column)) {
          violations.push(
            `${sourcePath}: CREATE OR REPLACE VIEW ${next.name} changes existing output columns `
            + `[${previous.columns.join(', ')}] to [${next.columns.join(', ')}]`,
          );
        }
      }
      views.set(next.key, {
        columns: next.columns,
        dependencies: trackedViewReferences(next.query, views),
        path: sourcePath,
      });
    }
  }
  return [...new Set(violations)];
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

function normalizedRoutineSignature(value) {
  return value.replaceAll('"', '').replace(/\s+/g, '').toLowerCase();
}

export function serviceRoleOnlyFunctionViolations(sources, signatures = []) {
  const targets = new Map(signatures.map(signature => {
    const normalized = normalizedRoutineSignature(signature);
    return [`FUNCTION:${normalized}`, { signature: normalized, defined: false, public: false, anon: false, authenticated: false, service_role: false }];
  }));

  for (const source of sources) {
    const parsed = lexSql(source);
    if (parsed.error) continue;
    for (const statement of parsed.statements) {
      const sql = statementHead(statement);
      const definition = functionDefinition(sql);
      if (definition && targets.has(definition.key)) {
        const state = targets.get(definition.key);
        if (!state.defined) state.public = true;
        state.defined = true;
        continue;
      }

      const dropped = sql.match(/^DROP FUNCTION(?: IF EXISTS)?\s+([\w".]+\s*\([^;]*\))/i);
      if (dropped) {
        const key = `FUNCTION:${normalizedRoutineSignature(dropped[1])}`;
        if (targets.has(key)) {
          const signature = targets.get(key).signature;
          targets.set(key, { signature, defined: false, public: false, anon: false, authenticated: false, service_role: false });
        }
        continue;
      }

      const privilegeSql = sql.replace(/\s+/g, ' ').trim();
      const privilege = privilegeSql.match(/^(GRANT|REVOKE)\s+(?:ALL(?:\s+PRIVILEGES)?|EXECUTE)\s+ON\s+FUNCTION\s+(.+?)\s+(?:TO|FROM)\s+(.+?);?$/i);
      if (!privilege) continue;
      const key = `FUNCTION:${normalizedRoutineSignature(privilege[2])}`;
      const state = targets.get(key);
      if (!state) continue;
      const granted = privilege[1].toUpperCase() === 'GRANT';
      for (const role of privilege[3].split(',').map(normalizedName)) {
        if (Object.hasOwn(state, role)) state[role] = granted;
      }
    }
  }

  const violations = [];
  for (const state of targets.values()) {
    if (!state.defined) {
      violations.push(`service-role-only function is not defined: ${state.signature}`);
      continue;
    }
    if (state.public) violations.push(`PUBLIC can execute service-role-only function: ${state.signature}`);
    if (state.anon || state.public) violations.push(`anon can execute service-role-only function: ${state.signature}`);
    if (state.authenticated || state.public) violations.push(`authenticated can execute service-role-only function: ${state.signature}`);
    if (!state.service_role) violations.push(`service_role cannot execute protected function: ${state.signature}`);
  }
  return violations;
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

  // Baseline re-runnability and safety rules, imported from the same module
  // the deploy gate uses, so this audit can never report PASS on a baseline
  // the gate will reject. See baseline-rules.mjs for the 2026-09-08 fold
  // that this closes.
  violations.push(...baselineDdlViolations(source));

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
  const migrationSources = [];
  const migrationEntries = [];

  for (const [index, filename] of filenames.entries()) {
    const relativePath = paths[index];
    const source = await readFile(path.join(migrationsDir, filename), 'utf8');
    migrationSources.push(source);
    migrationEntries.push({ path: relativePath, source });
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
  const viewHistoryViolations = incompatibleViewReplacementViolations([
    { path: policy.baseline, source: baselineSource },
    ...migrationEntries.filter(entry => entry.path !== policy.baseline),
  ]);
  const securityViolations = serviceRoleOnlyFunctionViolations(
    migrationSources,
    policy.serviceRoleOnlyFunctions,
  );
  const violationCount = policyErrors.length + baseline.violations.length + securityViolations.length
    + viewHistoryViolations.length
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
    securityViolations,
    viewHistoryViolations,
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
  for (const error of report.securityViolations) console.log(`SECURITY: ${error}`);
  for (const error of report.viewHistoryViolations) console.log(`VIEW HISTORY: ${error}`);
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
