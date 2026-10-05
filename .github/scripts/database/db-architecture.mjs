#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { declaredObjects } from './audit-db-drift.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const MIB = 1024 * 1024;
const REQUIRED = ['tables', 'indexes', 'foreignKeys', 'views', 'viewDependencies', 'routines', 'triggers', 'jobs', 'queries', 'columns', 'policies', 'retentionConfig', 'migrations'];
const exactCounts = { 'substrate.governance_telemetry': 'telemetry', 'substrate.raw_war_log': 'rawWarLog',
  'drivers.player_battles': 'battles', 'drivers.player_battle_daily': 'battleDaily', 'drivers.recruit_ledger': 'recruitLedger' };

/** Only equivalent physical signatures are grouped. Zero scans never imply safe removal. */
export function equivalentIndexes(indexes) {
  const groups = new Map();
  for (const index of indexes.filter(index => index.valid)) {
    if (['table', 'method', 'key', 'keyCount', 'opclasses', 'collations', 'options'].some(key => index[key] === undefined)) continue;
    const signature = JSON.stringify(['table', 'method', 'key', 'keyCount', 'opclasses', 'collations', 'options', 'predicate', 'expressions'].map(key => index[key]));
    const group = groups.get(signature) ?? [];
    group.push(index);
    groups.set(signature, group);
  }
  return [...groups.values()].filter(group => group.length > 1).map(group => ({
    table: group[0].table, indexes: group.map(index => index.id),
    protected: group.filter(index => index.unique || index.primary || index.constraintBacked).map(index => index.id),
    reviewCandidates: group.filter(index => !index.unique && !index.primary && !index.constraintBacked).map(index => index.id),
    bytes: group.reduce((sum, index) => sum + index.bytes, 0),
    action: 'Review definitions, query plans and dependencies. No automatic removal.',
  }));
}

export function compareSnapshots(current, previous) {
  if (!previous) return { status: 'NO_BASELINE', message: 'One snapshot cannot establish a growth rate. Capture a later snapshot and compare.' };
  if (!current.projectRef || current.projectRef !== previous.projectRef) return { status: 'NOT_COMPARABLE', message: 'Both snapshots must identify the same project.' };
  const seconds = (Date.parse(current.observedAt) - Date.parse(previous.observedAt)) / 1000;
  if (!(seconds > 0)) return { status: 'NOT_COMPARABLE', message: 'The comparison must be older than this snapshot.' };
  const restarted = current.serverStartedAt !== previous.serverStartedAt;
  const countersReset = restarted || current.databaseStatsResetAt !== previous.databaseStatsResetAt
    || current.statementStatsResetAt !== previous.statementStatsResetAt;
  const before = new Map((previous.tables ?? []).map(table => [table.id, table]));
  return { status: 'COMPARED', seconds, countersReset,
    databaseDeltaBytes: current.databaseBytes - previous.databaseBytes,
    tables: current.tables.map(table => {
      const prior = before.get(table.id);
      return { id: table.id, status: prior ? 'EXISTING' : 'NEW',
        deltaBytes: prior ? table.bytes - prior.bytes : null,
        // Counters can also reset for an individual relation without a server restart.
        insertedSinceBaseline: prior && !countersReset && table.inserted >= prior.inserted ? table.inserted - prior.inserted : null,
      };
    }),
    removedTables: [...before.keys()].filter(id => !current.tables.some(table => table.id === id)),
    message: 'Storage change is measured across this interval. It includes churn, maintenance and index changes; it is not automatically data growth.' };
}

/** Source sightings are navigational evidence, not a reconstruction of migration execution. */
export async function migrationSources(root = ROOT) {
  const directory = path.join(root, 'Backend/supabase/migrations');
  const files = (await readdir(directory)).filter(name => /^\d+_.*\.sql$/.test(name)).sort();
  const objects = {};
  const errors = [];
  for (const file of files) {
    const source = await readFile(path.join(directory, file), 'utf8');
    const parsed = declaredObjects(source);
    if (parsed.error) { errors.push({ file, error: String(parsed.error) }); continue; }
    for (const kind of ['tables', 'indexes', 'routines']) {
      for (const id of parsed[kind]) {
        const key = kind === 'routines' ? id.replace(/\(.*$/, '') : id;
        (objects[`${kind}:${key}`] ??= []).push(`Backend/supabase/migrations/${file}`);
      }
    }
  }
  return { fileCount: files.length, objects, errors,
    scope: 'All local migration files. Definition sightings only; drops, alterations and grants are not replayed. Use audit:db-drift for its explicitly baseline-scoped comparison.' };
}

export function buildArchitectureReport(snapshot, { catalog = {}, sources = null, previous = null } = {}) {
  if (snapshot?.version !== 1 || !Number.isFinite(snapshot.databaseBytes) || !Number.isFinite(Date.parse(snapshot.observedAt))) {
    throw new Error('Invalid architecture snapshot: version, timestamp and database size are required.');
  }
  const missing = REQUIRED.filter(key => !Array.isArray(snapshot[key]));
  if (missing.length) throw new Error(`Architecture evidence unavailable: ${missing.join(', ')}`);
  const tables = snapshot.tables.map(table => ({ ...table,
    purpose: catalog[table.id]?.purpose ?? 'Purpose not documented. Add this table to Backend/database-map.json.',
    lifecycle: catalog[table.id]?.lifecycle ?? 'Lifecycle not documented.',
    exactRows: snapshot.lifecycle?.[exactCounts[table.id]]?.rows ?? null,
    definitionSources: sources?.objects[`tables:${table.id}`] ?? [],
    dependentViews: snapshot.viewDependencies.filter(edge => edge.to === table.id).map(edge => edge.from),
    referencedByRoutines: snapshot.routines.filter(routine => routine.references?.includes(table.id)).map(routine => routine.name),
  }));
  const unknownTables = tables.filter(table => !catalog[table.id]).map(table => table.id);
  const estimateDisagreements = tables.filter(table => table.exactRows !== null && table.statisticsRows !== table.exactRows)
    .map(table => ({ id: table.id, exactRows: table.exactRows, statisticsEstimate: table.statisticsRows, plannerEstimate: table.plannerRows }));
  const indexGroups = equivalentIndexes(snapshot.indexes);
  const missingForeignKeyIndexes = snapshot.foreignKeys.filter(key => !key.indexed);
  const invalidIndexes = snapshot.indexes.filter(index => !index.valid).map(index => index.id);
  const anonymousDefiners = snapshot.routines.filter(routine => routine.anonExecute && routine.securityDefiner).map(routine => routine.id);
  const mutableSearchPaths = snapshot.routines.filter(routine => !routine.searchPathFixed).map(routine => routine.id);
  const undeclaredIndexes = sources ? snapshot.indexes.filter(index => !index.constraintBacked && !sources.objects[`indexes:${index.name}`]).map(index => index.id) : null;
  const findings = [];
  const add = (id, title, evidence, next) => findings.push({ id, title, evidence, next });
  const telemetry = tables.find(table => table.id === 'substrate.governance_telemetry');
  if (telemetry) add('telemetry-cost', 'Measure and reduce diagnostic payload cost',
    `Telemetry occupies ${(telemetry.bytes / MIB).toFixed(1)} MiB, including ${(telemetry.toastBytes / MIB).toFixed(1)} MiB of overflow storage. Retention limits age, not the size or rewrite frequency of each payload.`,
    'Profile stage payloads and heartbeat updates. Preserve error details and validation evidence while replacing repeated successful payloads with compact summaries.');
  if (snapshot.jobs.some(job => job.failed24h > 0)) add('job-failures', 'Scheduled work has recorded failures',
    `${snapshot.jobs.reduce((sum, job) => sum + job.failed24h, 0)} failures in the last 24 hours; ${snapshot.jobs.reduce((sum, job) => sum + job.startupTimeouts24h, 0)} startup timeouts.`,
    'Correlate cron start, Edge Function completion, ingestion freshness and host metrics. Dispatch success alone does not establish completion.');
  const battleRetention = snapshot.lifecycle?.battleRetention;
  if (battleRetention && (!(battleRetention.keepDays > 0) || !(battleRetention.purgeBatchRows > 0))) {
    add('battle-retention-config', 'Battle retention evidence is incomplete',
      'The audit did not find positive runtime values for the battle retention window and purge batch.',
      'Check the runtime configuration. Missing settings must not be treated as evidence that no backlog exists.');
  }
  if (battleRetention?.oldRowsWithoutSummary > 0) add('battle-fold-gaps', 'Old battles are missing their daily summaries',
    `${battleRetention.oldRowsWithoutSummary} battles older than the configured ${battleRetention.keepDays}-day window have no matching player/day/type summary. ${battleRetention.oldRowsWithSummary} old rows do have a summary.`,
    'Inspect late-arriving history and folding eligibility. Preserve raw records until summaries are complete; test retries and partially purged dates before changing the fold.');
  if (estimateDisagreements.length) add('counter-estimates', 'Table statistics differ from actual row counts',
    `${estimateDisagreements.length} counted tables disagree with statistics estimates. The server started at ${snapshot.serverStartedAt}.`,
    'Use labeled estimates, exact counts where justified and reset-aware comparisons. Do not infer empty tables or unused indexes from reset counters.');
  if (indexGroups.length) add('equivalent-indexes', 'Review structurally equivalent indexes',
    `${indexGroups.length} groups share an exact indexed-key signature. Unique and constraint-backed indexes are protected in the report.`,
    'Check plans and dependencies, record a migration, then measure write cost and storage. Zero scan counts alone are insufficient.');
  if (undeclaredIndexes?.length) add('index-source-gaps', 'Some explicit live indexes lack a CREATE INDEX sighting',
    `${undeclaredIndexes.length} non-constraint live indexes have no matching declaration in ${sources.fileCount} local migration files. Dynamic DDL and external provisioning still require review.`,
    'Resolve provenance and disaster recovery coverage. A name sighting cannot establish definition equivalence.');
  if (missingForeignKeyIndexes.length) add('foreign-key-indexes', 'Foreign keys need supporting index review',
    missingForeignKeyIndexes.map(key => `${key.from}.${key.name}`).join(', '), 'Inspect parent deletion and join plans before adding indexes.');
  if (invalidIndexes.length) add('invalid-indexes', 'Invalid indexes require investigation', invalidIndexes.join(', '), 'Inspect failed index creation or rebuild before repairing.');
  if (anonymousDefiners.length) add('public-rpcs', 'Review the public privileged RPC boundary',
    `${anonymousDefiners.length} SECURITY DEFINER routines are executable by anon. Read helpers and user actions must be classified individually.`,
    'Document intended public operations, abuse limits and exposed schemas. Verify allowed reads and forbidden writes using the real publishable role before changing grants.');
  if (mutableSearchPaths.length) add('routine-search-paths', 'Some routines inherit the caller search path', mutableSearchPaths.join(', '),
    'Review qualified references and apply fixed search paths through a migration with regression checks.');
  if (unknownTables.length) add('undocumented-tables', 'New tables need purpose and lifecycle documentation', unknownTables.join(', '), 'Update Backend/database-map.json.');
  const coverage = { inventory: 'CAPTURED', purposeMap: unknownTables.length ? 'INCOMPLETE' : 'COMPLETE',
    sourceNavigation: !sources ? 'UNAVAILABLE' : sources.errors.length ? 'INCOMPLETE' : 'CAPTURED',
    hostResources: 'USE_DB_HEALTH', securityAdvisor: 'RUN_SEPARATELY', queryFailureHistory: 'USE_LOGS_AND_DB_HEALTH',
    growth: previous ? 'SEE_COMPARISON' : 'NEEDS_SECOND_SNAPSHOT',
    executionPlans: 'NOT_CAPTURED', recoveryRehearsal: 'NOT_PERFORMED' };
  return { version: 1, observedAt: snapshot.observedAt, projectRef: snapshot.projectRef ?? null,
    snapshot: { ...snapshot, tables }, coverage, findings, equivalentIndexGroups: indexGroups,
    checks: { missingForeignKeyIndexes, invalidIndexes, anonymousDefiners, mutableSearchPaths, unknownTables, estimateDisagreements, undeclaredIndexes },
    sources, comparison: compareSnapshots(snapshot, previous),
    limitations: [
      'Snapshot collection is read-only and exports no row payloads, function bodies, cron commands or query text.',
      'Routine references are text-derived hints, not proven execution paths. View and foreign-key dependencies come from PostgreSQL catalogs.',
      'SELECT can call a function that writes. SQL shape is not a read-only guarantee.',
      'Query statistics include successful recorded executions; failed and cancelled requests need separate logs. The query list contains the forty largest recorded totals.',
      'Overflow storage includes live payloads, indexes and reusable space. Its size is not a direct measure of reclaimable waste.',
      'Row estimates, scan counts and elapsed totals depend on observation windows and resets. This report never automatically deletes data or indexes.',
    ] };
}

export function safeEmbeddedJson(value) {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

export async function renderArchitectureHtml(report) {
  const template = await readFile(new URL('./db-architecture.html', import.meta.url), 'utf8');
  return template.replace('__ARCHITECTURE_DATA__', () => safeEmbeddedJson(report));
}

export async function collectArchitectureSnapshot() {
  if (!process.env.SUPABASE_ACCESS_TOKEN) throw new Error('SUPABASE_ACCESS_TOKEN is required; use --snapshot for offline inspection.');
  const projectRef = (await readFile(path.join(ROOT, 'Backend/supabase/.temp/project-ref'), 'utf8')).trim();
  if (!/^[a-z]{20}$/.test(projectRef)) throw new Error('Linked project ref is invalid.');
  const query = await readFile(new URL('./db-architecture-snapshot.sql', import.meta.url), 'utf8');
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, read_only: true }), signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) throw new Error(`Architecture snapshot unavailable: HTTP ${response.status}. No successful audit is implied.`);
  const rows = await response.json();
  if (!rows[0]?.architecture) throw new Error('Architecture snapshot unavailable: no inventory returned.');
  return { ...rows[0].architecture, projectRef };
}

export function formatArchitectureReport(report) {
  const s = report.snapshot;
  return [`Database architecture observed at ${report.observedAt}`, `Database: ${(s.databaseBytes / MIB).toFixed(1)} MiB`,
    `Inventory: ${s.tables.length} tables, ${s.views.length} views, ${s.routines.length} routines, ${s.triggers.length} triggers, ${s.indexes.length} indexes, ${s.jobs.length} scheduled jobs`,
    `Purpose map: ${report.coverage.purposeMap}; all local migration sources: ${report.coverage.sourceNavigation}`,
    `Foreign keys without supporting indexes: ${report.checks.missingForeignKeyIndexes.length}; invalid indexes: ${report.checks.invalidIndexes.length}`,
    `Growth evidence: ${report.comparison.status}. ${report.comparison.message}`,
    '', ...report.findings.flatMap(finding => [finding.title, `  Evidence: ${finding.evidence}`, `  Next: ${finding.next}`, '']),
    'This is an inventory and diagnostic baseline, not a claim that every query, policy or recovery path has been verified.'].join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('pnpm db:audit [--snapshot snapshot.json] [--compare older-snapshot.json] [--output /path/report] [--json]\nDefault: capture a read-only live inventory. --output writes .snapshot.json, .json and .html. Offline snapshots are trusted local files; exported metadata should remain private.');
    return;
  }
  const allowed = new Set(['--snapshot', '--compare', '--output', '--json']);
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (!allowed.has(args[i])) throw new Error(`Unknown option: ${args[i]}`);
    if (args[i] === '--json') options.json = true;
    else {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`${args[i]} requires a path.`);
      options[args[i].slice(2)] = args[++i];
    }
  }
  const snapshot = options.snapshot ? JSON.parse(await readFile(options.snapshot, 'utf8')) : await collectArchitectureSnapshot();
  const [catalog, sources, previous] = await Promise.all([
    readFile(path.join(ROOT, 'Backend/database-map.json'), 'utf8').then(JSON.parse), migrationSources(),
    options.compare ? readFile(options.compare, 'utf8').then(JSON.parse) : null,
  ]);
  const report = buildArchitectureReport(snapshot, { catalog, sources, previous });
  if (options.output) {
    const base = path.resolve(options.output);
    await writeFile(`${base}.snapshot.json`, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o600 });
    await writeFile(`${base}.json`, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    await writeFile(`${base}.html`, await renderArchitectureHtml(report), { mode: 0o600 });
    if (!options.json) console.log(`Saved ${base}.html, .json and .snapshot.json`);
  }
  console.log(options.json ? JSON.stringify(report, null, 2) : formatArchitectureReport(report));
  if (report.coverage.purposeMap !== 'COMPLETE' || report.coverage.sourceNavigation !== 'CAPTURED') process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error instanceof Error ? error.message : 'Architecture audit unavailable.'); process.exitCode = 1; });
}
