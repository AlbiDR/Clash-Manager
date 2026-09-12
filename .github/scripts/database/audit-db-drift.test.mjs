// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from 'node:assert/strict';
import test from 'node:test';

import { alignmentVerdict, auditDbDrift, compareDrift, declaredObjects, describeAlignment, exposedSchemas } from './audit-db-drift.mjs';

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

test('a live body behind a vault-reading baseline names the right remediation', () => {
  // The first production run said "it is in no tracked file, so no repository
  // audit can detect it" about three functions that master_migration.sql
  // declares reading from Vault. Both halves were wrong, and the sentence
  // pointed at writing a fix that already existed.
  const baseline = `${BASELINE}
CREATE OR REPLACE FUNCTION drivers.run_job() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM net.http_post(url := 'https://x', headers := jsonb_build_object(
    'Authorization', 'Bearer ' || drivers.get_vault_secret('TOKEN')));
END;
$$;
`;
  const live = clone();
  live.routines.push({
    schema: 'drivers', name: 'run_job',
    hasEmbeddedSecret: true, usesVaultLookup: false, secretRules: ['bearer'],
  });
  const finding = compareDrift(live, declaredObjects(baseline)).find(f => f.direction === 'LIVE_SECRET');
  assert.ok(finding, 'the credential must still be reported');
  assert.match(finding.consequence, /older definition than the repository declares/);
  assert.match(finding.consequence, /apply the declared definition/);
  assert.doesNotMatch(finding.consequence, /no tracked file/);
  assert.match(finding.consequence, /Matched by: bearer/, 'the report must say which rule fired');
});

test('a routine the baseline never declared safely gets the rotate-and-move wording', () => {
  const live = clone();
  live.routines.push({
    schema: 'drivers', name: 'legacy_job',
    hasEmbeddedSecret: true, usesVaultLookup: false, secretRules: ['jwt'],
  });
  const finding = compareDrift(live, declared()).find(f => f.object === 'drivers.legacy_job');
  assert.match(finding.consequence, /resolve it at runtime instead of embedding it/);
  assert.doesNotMatch(finding.consequence, /older definition/, 'nothing declared, so there is nothing to apply');
});

test('declaredObjects records which routines the baseline resolves at runtime', () => {
  const baseline = `
CREATE OR REPLACE FUNCTION drivers.safe() RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM drivers.get_vault_secret('TOKEN'); END; $$;
CREATE OR REPLACE FUNCTION drivers.plain() RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM 1; END; $$;
`;
  const parsed = declaredObjects(baseline);
  assert.ok(parsed.vaultRoutines.has('drivers.safe'));
  assert.ok(!parsed.vaultRoutines.has('drivers.plain'));
});

test('a secret finding never carries the body, only the rule that fired', () => {
  // The whole point of flagging rather than extracting: the report travels to
  // a step summary in a PUBLIC repository.
  const live = clone();
  live.routines.push({
    schema: 'drivers', name: 'leaky',
    hasEmbeddedSecret: true, usesVaultLookup: false,
    secretRules: ['jwt'],
    // A snapshot must never carry this, but if one ever did, the finding
    // still must not repeat it.
  });
  const finding = compareDrift(live, declared()).find(f => f.object === 'drivers.leaky');
  assert.doesNotMatch(JSON.stringify(finding), /eyJ/);
});

const SECRET_FINDINGS = [
  { direction: 'LIVE_SECRET', object: 'substrate.run_a' },
  { direction: 'LIVE_SECRET', object: 'substrate.run_b' },
  { direction: 'LIVE_NOT_DECLARED', object: 'drivers.idx_x' },
];

test('alignment says the callers survive when the literal IS the Vault value', () => {
  const text = describeAlignment({
    status: 'OK',
    routinesEmbeddingVaultValues: [
      { schema: 'substrate', name: 'run_a' }, { schema: 'substrate', name: 'run_b' },
    ],
  }, SECRET_FINDINGS);
  assert.match(text, /same, so applying the declared definitions/);
  assert.match(text, /callers keep working/);
});

test('alignment warns when the live literal is a DIFFERENT secret', () => {
  // The case that decides whether this is a one-step or a coordinated change:
  // switching to Vault would make the database send a token the edge runtime
  // has never been given.
  const text = describeAlignment({ status: 'OK', routinesEmbeddingVaultValues: [] }, SECRET_FINDINGS);
  assert.match(text, /DIFFERENT secret/);
  assert.match(text, /every caller would fail at once/);
});

test('a mixed live database is reported as mixed, not rounded to either side', () => {
  const text = describeAlignment({
    status: 'OK', routinesEmbeddingVaultValues: [{ schema: 'substrate', name: 'run_a' }],
  }, SECRET_FINDINGS);
  assert.match(text, /1 of 2/);
  assert.match(text, /on its own evidence/);
});

test('an unreadable vault is undetermined, never an all-clear', () => {
  // Same discipline as NOT_COMPARED: the probe reads vault.decrypted_secrets,
  // which is the one privileged read here, and "it threw" must not render as
  // "the values agree".
  const text = describeAlignment({ status: 'UNDETERMINED', reason: 'permission denied' }, SECRET_FINDINGS);
  assert.match(text, /could not be determined/);
  assert.match(text, /permission denied/);
  assert.doesNotMatch(text, /keep working/);
});

test('no credential findings means no alignment paragraph at all', () => {
  assert.equal(describeAlignment({ status: 'OK', routinesEmbeddingVaultValues: [] }, []), null);
});

test('the machine verdict never says aligned on absent evidence', () => {
  // This string is what unlocks propagation in the deploy, so every way of
  // not knowing has to come out as something other than "aligned".
  assert.equal(alignmentVerdict({ status: 'UNDETERMINED' }, SECRET_FINDINGS).verdict, 'unknown');
  assert.equal(alignmentVerdict(null, SECRET_FINDINGS).verdict, 'unknown');
  assert.equal(alignmentVerdict({ status: 'OK', routinesEmbeddingVaultValues: [] }, SECRET_FINDINGS).verdict, 'divergent');
  assert.equal(alignmentVerdict({
    status: 'OK', routinesEmbeddingVaultValues: [{ schema: 'substrate', name: 'run_a' }],
  }, SECRET_FINDINGS).verdict, 'mixed', 'a partial match is not an all-clear');
});

test('a database with no embedded literal at all is aligned by definition', () => {
  const state = alignmentVerdict({ status: 'OK', routinesEmbeddingVaultValues: [] }, []);
  assert.equal(state.verdict, 'aligned');
  assert.deepEqual(state.flagged, [], 'nothing is at risk, so nothing is held back');
});

test('the verdict reports the routines the deploy must treat as risky', () => {
  const state = alignmentVerdict({ status: 'UNDETERMINED' }, SECRET_FINDINGS);
  assert.deepEqual(state.flagged, ['substrate.run_a', 'substrate.run_b']);
});

const REQUIRED = new Map([
  ['substrate.run_a', new Set(['INTERNAL_BEARER_TOKEN', 'SUPABASE_ANON_KEY'])],
  ['substrate.run_b', new Set(['INTERNAL_BEARER_TOKEN'])],
]);

test('a credential missing from Vault makes the verdict incomplete, never aligned', () => {
  // The measured case: SUPABASE_ANON_KEY is read by four declared functions
  // and is not in Vault at all, so get_vault_secret returns NULL. A routine
  // whose OTHER token does match Vault would otherwise have read as aligned
  // while still being impossible to switch over.
  const state = alignmentVerdict({
    status: 'OK',
    vaultSecretNames: [{ name: 'INTERNAL_BEARER_TOKEN', kind: 'opaque' }],
    routinesEmbeddingVaultValues: [
      { schema: 'substrate', name: 'run_a' }, { schema: 'substrate', name: 'run_b' },
    ],
  }, SECRET_FINDINGS, REQUIRED);
  assert.equal(state.verdict, 'incomplete', 'a full literal match is still not switchable');
  assert.deepEqual(state.missing, [{ routine: 'substrate.run_a', credential: 'SUPABASE_ANON_KEY' }]);
});

test('the incomplete case explains the NULL rather than only naming it', () => {
  const text = describeAlignment({
    status: 'OK',
    vaultSecretNames: [{ name: 'INTERNAL_BEARER_TOKEN' }],
    routinesEmbeddingVaultValues: [],
  }, SECRET_FINDINGS, REQUIRED);
  assert.match(text, /SUPABASE_ANON_KEY/);
  assert.match(text, /returns NULL/);
  assert.match(text, /before anything is switched over/);
});

test('once Vault holds everything, the ordinary verdicts resume', () => {
  const full = [{ name: 'INTERNAL_BEARER_TOKEN' }, { name: 'SUPABASE_ANON_KEY' }];
  assert.equal(alignmentVerdict({
    status: 'OK', vaultSecretNames: full,
    routinesEmbeddingVaultValues: [{ schema: 'substrate', name: 'run_a' }, { schema: 'substrate', name: 'run_b' }],
  }, SECRET_FINDINGS, REQUIRED).verdict, 'aligned');
  assert.equal(alignmentVerdict({
    status: 'OK', vaultSecretNames: full, routinesEmbeddingVaultValues: [],
  }, SECRET_FINDINGS, REQUIRED).verdict, 'divergent');
});

test('an older probe returning bare name strings is still understood', () => {
  const state = alignmentVerdict({
    status: 'OK',
    vaultSecretNames: ['INTERNAL_BEARER_TOKEN', 'SUPABASE_ANON_KEY'],
    routinesEmbeddingVaultValues: [{ schema: 'substrate', name: 'run_a' }, { schema: 'substrate', name: 'run_b' }],
  }, SECRET_FINDINGS, REQUIRED);
  assert.equal(state.verdict, 'aligned', 'the shape changed, the meaning did not');
});

test('declaredObjects exposes what each routine needs from Vault', () => {
  const parsed = declaredObjects(`
CREATE OR REPLACE FUNCTION substrate.run_job() RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM substrate.get_vault_secret('INTERNAL_BEARER_TOKEN');
      PERFORM substrate.get_vault_secret('SUPABASE_ANON_KEY'); END; $$;
`);
  assert.deepEqual([...parsed.vaultReadsByRoutine.get('substrate.run_job')].sort(),
    ['INTERNAL_BEARER_TOKEN', 'SUPABASE_ANON_KEY']);
});

const EXPOSED = exposedSchemas('[api]\nschemas = ["public", "storage", "graphql_public", "features"]\n');
const secdef = (over = {}) => ({
  schema: 'public', name: 'get_vault_secret', hasEmbeddedSecret: false,
  securityDefiner: true, executableByAnon: true, usesVaultLookup: true, ...over,
});

test('exposedSchemas reads the project config rather than assuming a list', () => {
  assert.deepEqual([...EXPOSED].sort(), ['features', 'graphql_public', 'public', 'storage']);
  assert.equal(exposedSchemas('nothing here'), null, 'an unreadable config must be null, not an empty set');
});

test('an anon-executable SECURITY DEFINER vault reader in an exposed schema is reported', () => {
  // public.get_vault_secret is the shape this guards: SECURITY DEFINER over
  // vault.decrypted_secrets in a Data API exposed schema. Production turned
  // out to be restricted already, but nothing in the repository declared that
  // and no checker could have told the difference either way.
  const live = clone();
  live.routines.push(secdef());
  const finding = compareDrift(live, declared(), EXPOSED).find(f => f.direction === 'LIVE_ANON_EXECUTABLE');
  assert.ok(finding, 'this must be reported');
  assert.match(finding.consequence, /publishable key/);
  assert.match(finding.consequence, /reads Vault, so this exposes secrets directly/);
  assert.match(finding.consequence, /REVOKE EXECUTE/);
});

test('the same function is not reported once anon can no longer execute it', () => {
  const live = clone();
  live.routines.push(secdef({ executableByAnon: false }));
  assert.deepEqual(compareDrift(live, declared(), EXPOSED).filter(f => f.direction === 'LIVE_ANON_EXECUTABLE'), []);
});

test('an unexposed schema is not reachable over PostgREST and is not reported', () => {
  const live = clone();
  live.routines.push(secdef({ schema: 'substrate' }));
  assert.deepEqual(compareDrift(live, declared(), EXPOSED).filter(f => f.direction === 'LIVE_ANON_EXECUTABLE'), []);
});

test('a SECURITY INVOKER function is not reported however widely granted', () => {
  // Without SECURITY DEFINER the caller's own privileges apply, so a PUBLIC
  // grant does not escalate anything.
  const live = clone();
  live.routines.push(secdef({ securityDefiner: false }));
  assert.deepEqual(compareDrift(live, declared(), EXPOSED).filter(f => f.direction === 'LIVE_ANON_EXECUTABLE'), []);
});

test('an unknown exposed-schema list SKIPS the check rather than clearing it', () => {
  // Guessing wrong here clears a function that really is reachable, which is
  // strictly worse than not checking. The report says the check did not run.
  const live = clone();
  live.routines.push(secdef());
  assert.deepEqual(compareDrift(live, declared(), null).filter(f => f.direction === 'LIVE_ANON_EXECUTABLE'), []);
});

test('an older snapshot without the privilege fields reports nothing rather than guessing', () => {
  const live = clone();
  live.routines.push({ schema: 'public', name: 'legacy', hasEmbeddedSecret: false });
  assert.deepEqual(compareDrift(live, declared(), EXPOSED).filter(f => f.direction === 'LIVE_ANON_EXECUTABLE'), []);
});
