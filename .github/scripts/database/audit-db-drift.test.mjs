// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from 'node:assert/strict';
import test from 'node:test';

import { auditDbDrift, compareDrift, declaredObjects } from './audit-db-drift.mjs';

const BASELINE = `
CREATE SCHEMA IF NOT EXISTS drivers;
CREATE TABLE IF NOT EXISTS drivers.members (id bigint, tag text);
ALTER TABLE drivers.members ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_members_tag ON drivers.members (tag);
CREATE OR REPLACE FUNCTION drivers.ping() RETURNS boolean
LANGUAGE sql SET search_path TO drivers AS $$ SELECT true $$;
`;

const LIVE = {
  columns: [
    { schema: 'drivers', table: 'members', column: 'id' },
    { schema: 'drivers', table: 'members', column: 'tag' },
  ],
  indexes: [{ schema: 'drivers', table: 'members', name: 'idx_members_tag' }],
  routines: [{ schema: 'drivers', name: 'ping', hasEmbeddedSecret: false }],
  rlsEnabled: [{ schema: 'drivers', table: 'members' }],
};

const clone = () => JSON.parse(JSON.stringify(LIVE));
const declared = () => declaredObjects(BASELINE);

test('an agreeing database and baseline produce no findings', () => {
  assert.deepEqual(compareDrift(LIVE, declared()), []);
});

test('an index that exists only live is reported, with the rebuild consequence', () => {
  // The documented case: five indexes on drivers.player_battles exist only in
  // the database, and grepping the migrations for them returns nothing.
  const live = clone();
  live.indexes.push({ schema: 'drivers', table: 'player_battles', name: 'idx_player_battles_tag_time' });
  const findings = compareDrift(live, declared());
  assert.equal(findings.length, 1);
  assert.equal(findings[0].direction, 'LIVE_NOT_DECLARED');
  assert.equal(findings[0].object, 'drivers.idx_player_battles_tag_time');
  assert.match(findings[0].consequence, /rebuild from the baseline would not create it/);
});

test('a constraint-backed index is not mistaken for drift', () => {
  const live = clone();
  live.indexes.push({ schema: 'drivers', table: 'members', name: 'members_pkey' });
  live.indexes.push({ schema: 'drivers', table: 'members', name: 'uq_member_key' });
  assert.deepEqual(compareDrift(live, declared()), [], 'pkey and unique constraint indexes are created by their constraint');
});

test('a table the baseline declares but the database lacks is reported', () => {
  // The inverse direction: CREATE TABLE IF NOT EXISTS silently skipping
  // against an existing table is what made report_heartbeat raise 42703 on
  // every call for three and a half days.
  const live = clone();
  live.columns = [];
  live.columns.push({ schema: 'drivers', table: 'other', column: 'x' });
  const findings = compareDrift(live, declared());
  assert.ok(findings.some(f => f.direction === 'DECLARED_NOT_LIVE' && f.kind === 'TABLE' && f.object === 'drivers.members'));
});

test('RLS declared in the baseline but disabled live is reported', () => {
  const live = clone();
  live.rlsEnabled = [];
  const findings = compareDrift(live, declared());
  assert.ok(findings.some(f => f.kind === 'RLS' && f.object === 'drivers.members'));
});

test('a credential in a routine body is reported as its own direction', () => {
  // No repository-side audit can ever see this: the body is in the database
  // and in no tracked file.
  const live = clone();
  live.routines = [{ schema: 'drivers', name: 'ping', hasEmbeddedSecret: true }];
  const findings = compareDrift(live, declared());
  const secret = findings.find(f => f.direction === 'LIVE_SECRET');
  assert.ok(secret, 'an embedded secret must be reported');
  assert.match(secret.consequence, /Rotate the credential/);
});

test('the two directions are never collapsed into one count', () => {
  // Collapsing them is how the 2026-09-06 reasoning went wrong: "missing" and
  // "undeclared" call for opposite actions.
  const live = clone();
  live.rlsEnabled = [];
  live.indexes.push({ schema: 'drivers', table: 'members', name: 'idx_only_live' });
  const directions = new Set(compareDrift(live, declared()).map(f => f.direction));
  assert.deepEqual([...directions].sort(), ['DECLARED_NOT_LIVE', 'LIVE_NOT_DECLARED']);
});

test('declaredObjects reuses the migration parser rather than guessing', () => {
  const parsed = declared();
  assert.ok(parsed.tables.has('drivers.members'));
  assert.ok(parsed.indexes.has('idx_members_tag'));
  assert.ok(parsed.rls.has('drivers.members'));
  assert.ok([...parsed.routines].some(name => name.startsWith('drivers.ping')));
});

test('every unusable snapshot is NOT_COMPARED, never a pass', async () => {
  // The entire premise: an absent answer has been reading as a clean one on
  // every night Stage 3 has ever run.
  const cases = [
    { label: 'no path', args: {} },
    { label: 'unreadable', args: { snapshotPath: '/nope.json', readFileImpl: async () => { throw new Error('ENOENT'); } } },
    { label: 'malformed', args: { snapshotPath: 'x', readFileImpl: async () => 'not json' } },
    { label: 'no columns key', args: { snapshotPath: 'x', readFileImpl: async () => '{}' } },
    { label: 'zero columns', args: { snapshotPath: 'x', readFileImpl: async () => '{"columns":[]}' } },
  ];
  for (const item of cases) {
    const report = await auditDbDrift(item.args);
    assert.equal(report.status, 'NOT_COMPARED', `${item.label} must not pass`);
    assert.ok(report.reason, `${item.label} must say why`);
  }
});

test('a real comparison against a matching baseline reports MATCH', async () => {
  const report = await auditDbDrift({
    snapshotPath: 'snapshot.json',
    readFileImpl: async file => (file === 'snapshot.json' ? JSON.stringify(LIVE) : BASELINE),
  });
  assert.equal(report.status, 'MATCH');
  assert.deepEqual(report.findings, []);
});

test('a constraint-backed index is identified by the database, not by its name', () => {
  // The first production run guessed from the suffix and reported
  // members_new_pkey1 and several *_unique indexes as drift. Those are created
  // by their PRIMARY KEY or UNIQUE constraint and cannot be declared
  // separately, and that false positive rate is how an audit stops being read.
  const live = clone();
  live.indexes.push({ schema: 'drivers', table: 'members', name: 'members_new_pkey1', constraintBacked: true });
  live.indexes.push({ schema: 'drivers', table: 'members', name: 'members_tag_unique', constraintBacked: true });
  live.indexes.push({ schema: 'drivers', table: 'members', name: 'idx_real_drift', constraintBacked: false });
  const findings = compareDrift(live, declared());
  assert.deepEqual(findings.map(f => f.object), ['drivers.idx_real_drift'],
    'only the genuinely undeclared index is drift');
});

test('an older snapshot without the field degrades to the name heuristic', () => {
  // A snapshot captured before constraintBacked existed must not suddenly
  // report every constraint index as drift.
  const live = clone();
  live.indexes.push({ schema: 'drivers', table: 'members', name: 'members_pkey' });
  live.indexes.push({ schema: 'drivers', table: 'members', name: 'members_new_pkey1' });
  assert.deepEqual(compareDrift(live, declared()), []);
});
