// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  computeFanout, deriveTopUp, parseEdgePropagation, parseEdgeReads, parseGithubSecrets,
  parseVaultPropagation, parseVaultReads, parseVaultReadsByRoutine, render, renderPlan,
  riskyCredentials,
} from './credential-fanout.mjs';
import { parseAlignedFlag } from './audit-credential-fanout.mjs';

const WORKFLOW = `
name: deploy
env:
  INTERNAL_BEARER_TOKEN: \${{ secrets.INTERNAL_BEARER_TOKEN }}
  ROYALE_API_KEYS: \${{ secrets.ROYALE_API_KEYS }}
  TOKEN: \${{ secrets.GITHUB_TOKEN }}
run: |
  supabase secrets set --project-ref "$PROJECT_ID" ROYALE_API_KEYS="$ROYALE_API_KEYS"
  for KEY in "INTERNAL_BEARER_TOKEN" "CLAN_TAG"; do
    echo "$KEY"
  done
`;

const EDGE = `const token = Deno.env.get('INTERNAL_BEARER_TOKEN');
const url = Deno.env.get("SUPABASE_URL");
const keys = Deno.env.get(\`ROYALE_API_KEYS\`);`;

const MIGRATION = `
CREATE OR REPLACE FUNCTION substrate.run_job() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM substrate.get_vault_secret('INTERNAL_BEARER_TOKEN');
  PERFORM substrate.get_vault_secret('SUPABASE_ANON_KEY');
END; $$;
CREATE OR REPLACE FUNCTION substrate.other_job() RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM 1; END; $$;
`;

const build = (overrides = {}) => computeFanout({
  githubSecrets: parseGithubSecrets([WORKFLOW]),
  edgePropagated: parseEdgePropagation([WORKFLOW]),
  vaultPropagated: parseVaultPropagation([WORKFLOW]),
  edgeReads: parseEdgeReads([EDGE]),
  vaultReads: parseVaultReads([MIGRATION]),
  vaultReadsByRoutine: parseVaultReadsByRoutine([MIGRATION]),
  ...overrides,
});
const find = (report, name) => report.entries.find(entry => entry.name === name);

test('GITHUB_TOKEN is not a credential anyone rotates', () => {
  assert.ok(!parseGithubSecrets([WORKFLOW]).has('GITHUB_TOKEN'), 'Actions mints it per run');
  assert.ok(parseGithubSecrets([WORKFLOW]).has('INTERNAL_BEARER_TOKEN'));
});

test('a credential read at the edge but never pushed there costs a manual edit', () => {
  // The measured case: seven edge functions read INTERNAL_BEARER_TOKEN and no
  // `supabase secrets set` call mentions it, so the value is placed by hand.
  const entry = find(build(), 'INTERNAL_BEARER_TOKEN');
  assert.equal(entry.manualWritePoints, 1);
  assert.ok(entry.manual.some(store => /edge runtime/.test(store)));
  assert.ok(entry.derived.some(store => /Vault \(set by the deploy\)/.test(store)));
});

test('a credential the deploy pushes everywhere costs nothing', () => {
  assert.equal(find(build(), 'ROYALE_API_KEYS').manualWritePoints, 0);
});

test('a platform-injected name is never counted as a manual edit', () => {
  // Supabase supplies SUPABASE_URL to every function; there is nothing to set.
  assert.equal(find(build(), 'SUPABASE_URL').manualWritePoints, 0);
});

test('a Vault-read credential the deploy never syncs costs a manual edit', () => {
  const entry = find(build(), 'SUPABASE_ANON_KEY');
  assert.equal(entry.manualWritePoints, 1);
  assert.ok(entry.manual.includes('Supabase Vault'));
});

test('an unparseable workflow reports unknown rather than zero cost', () => {
  // The failure this exists to prevent: a parse that finds nothing looks
  // exactly like a deploy that propagates nothing, and the second reading
  // would mark every credential manual. Silence must not read as an answer.
  const report = computeFanout({
    githubSecrets: new Set(['INTERNAL_BEARER_TOKEN']),
    edgePropagated: parseEdgePropagation(['name: nothing here']),
    vaultPropagated: parseVaultPropagation(['name: nothing here']),
    edgeReads: new Set(['INTERNAL_BEARER_TOKEN']),
    vaultReads: new Set(['INTERNAL_BEARER_TOKEN']),
  });
  assert.equal(report.unknown.length, 2, 'both channels must be reported undetermined');
  assert.match(render(report), /COULD NOT BE DETERMINED/);
  assert.ok(find(report, 'INTERNAL_BEARER_TOKEN').manual.every(store => /unknown/.test(store)));
});

test('a live body literal is attributed only to what that routine declares it reads', () => {
  // The audit never reads a value, so it cannot match a literal to a name
  // directly. The declared version of the same routine is the attribution.
  const report = build({ liveLiteralRoutines: ['substrate.run_job'] });
  assert.ok(find(report, 'INTERNAL_BEARER_TOKEN').manual.some(store => /live function body/.test(store)));
  assert.ok(!find(report, 'ROYALE_API_KEYS').manual.some(store => /live function body/.test(store)),
    'a routine that does not read this credential must not inflate its cost');
});

test('a literal in a routine that declares no vault read is attributed to nobody', () => {
  const report = build({ liveLiteralRoutines: ['substrate.other_job'] });
  for (const entry of report.entries) {
    assert.ok(!entry.manual.some(store => /live function body/.test(store)));
  }
});

test('parseVaultReadsByRoutine splits bodies at the next function header', () => {
  const byRoutine = parseVaultReadsByRoutine([MIGRATION]);
  assert.deepEqual([...byRoutine.get('substrate.run_job')].sort(), ['INTERNAL_BEARER_TOKEN', 'SUPABASE_ANON_KEY']);
  assert.ok(!byRoutine.has('substrate.other_job'), 'a body with no vault read is not listed');
});

test('the report is ranked by what a rotation costs', () => {
  const entries = build().entries;
  for (let i = 1; i < entries.length; i += 1) {
    assert.ok(entries[i - 1].manualWritePoints >= entries[i].manualWritePoints, 'worst first');
  }
});

test('the verdict states the target rather than only the number', () => {
  assert.match(render(build()), /Until that is 0, a rotation can half-land/);
  assert.match(render(computeFanout({
    githubSecrets: new Set(['X']), edgePropagated: new Set(), vaultPropagated: new Set(),
    edgeReads: new Set(), vaultReads: new Set(),
  })), /Rotating one is a single edit/);
});

const planFor = (overrides = {}) => deriveTopUp({
  edgeReads: parseEdgeReads([EDGE]),
  vaultReads: parseVaultReads([MIGRATION]),
  edgePropagated: parseEdgePropagation([WORKFLOW]),
  vaultPropagated: parseVaultPropagation([WORKFLOW]),
  availableEnv: new Set(['INTERNAL_BEARER_TOKEN', 'SUPABASE_ANON_KEY', 'ROYALE_API_KEYS']),
  ...overrides,
});

const RISKY = riskyCredentials({
  liveLiteralRoutines: ['substrate.run_job'],
  vaultReadsByRoutine: parseVaultReadsByRoutine([MIGRATION]),
});

test('risky credentials are derived from what the flagged routine declares it reads', () => {
  assert.deepEqual([...RISKY].sort(), ['INTERNAL_BEARER_TOKEN', 'SUPABASE_ANON_KEY']);
  assert.equal(riskyCredentials({ liveLiteralRoutines: [], vaultReadsByRoutine: new Map() }).size, 0);
});

test('the top-up only names what the explicit calls missed', () => {
  // aligned is explicit: with the gate safe by default, a plan that
  // propagates anything vault-read is only reachable once alignment is known.
  const plan = planFor({ aligned: true });
  assert.ok(plan.edge.includes('INTERNAL_BEARER_TOKEN'), 'read at the edge and never set there');
  assert.ok(!plan.edge.includes('ROYALE_API_KEYS'), 'already set by an explicit call');
  assert.ok(!plan.edge.includes('SUPABASE_URL'), 'injected by the platform');
  assert.ok(plan.vault.includes('SUPABASE_ANON_KEY'), 'read from Vault and never synced there');
});

test('a risky credential is held back until alignment is confirmed', () => {
  // The safety argument in one test: propagating this before knowing the live
  // database holds the same token puts a different secret on each side.
  for (const aligned of [null, false]) {
    const plan = planFor({ risky: RISKY, aligned });
    assert.deepEqual(plan.edge, [], 'nothing risky may be propagated');
    assert.deepEqual(plan.vault, []);
    assert.equal(plan.gated.length, 2);
  }
});

test('confirmed alignment releases exactly the held-back names', () => {
  const plan = planFor({ risky: RISKY, aligned: true });
  assert.deepEqual(plan.gated, []);
  assert.ok(plan.edge.includes('INTERNAL_BEARER_TOKEN'));
  assert.ok(plan.vault.includes('SUPABASE_ANON_KEY'));
});

test('a credential with no value to propagate is blocked, not skipped', () => {
  // "Nothing to propagate" and "nowhere to propagate it from" are different
  // problems, and only the second one needs a human to do something.
  const plan = planFor({ availableEnv: new Set(['ROYALE_API_KEYS']), aligned: true });
  assert.ok(plan.blocked.some(item => item.name === 'INTERNAL_BEARER_TOKEN'));
  assert.match(renderPlan(plan), /NO SOURCE.*Add a GitHub secret/s);
});

test('an unparseable channel is declined rather than propagated blindly', () => {
  // The actuator half of the detector rule: if the parse found nothing and a
  // deploy that propagates nothing look the same, acting on that is a guess.
  const plan = deriveTopUp({
    edgeReads: new Set(['INTERNAL_BEARER_TOKEN']),
    vaultReads: new Set(['INTERNAL_BEARER_TOKEN']),
    edgePropagated: null,
    vaultPropagated: null,
    availableEnv: new Set(['INTERNAL_BEARER_TOKEN']),
  });
  assert.deepEqual(plan.edge, []);
  assert.deepEqual(plan.vault, []);
  assert.deepEqual(plan.unparsed.sort(), ['edge', 'vault']);
  assert.match(renderPlan(plan), /Declining to act on/);
});

test('only the exact string "aligned" unlocks a risky name', () => {
  // A flag that defaulted to permissive would put the whole safety argument
  // behind a typo.
  assert.equal(parseAlignedFlag('aligned'), true);
  assert.equal(parseAlignedFlag('divergent'), false);
  for (const raw of [null, undefined, '', 'unknown', 'mixed', 'ALIGNED', 'true', 'yes']) {
    assert.notEqual(parseAlignedFlag(raw), true, `${raw} must not unlock anything`);
  }
});

test('an empty plan renders as a no-op rather than as success', () => {
  const plan = deriveTopUp({
    edgeReads: new Set(), vaultReads: new Set(),
    edgePropagated: new Set(), vaultPropagated: new Set(),
  });
  assert.match(renderPlan(plan), /Nothing to add/);
});

test('with NO evidence at all, nothing vault-read is propagated', () => {
  // Regression. The gate first derived its risky set only from the routines
  // the caller passed in, so the case where the probe never ran at all, which
  // arrives as an empty list, held nothing back and propagated freely. A
  // missing state file is the most likely failure in production, not the
  // least, and it has to be the safest one.
  const plan = planFor({ risky: new Set(), aligned: null });
  assert.deepEqual(plan.edge, [], 'a token a declared routine reads from Vault must be held');
  assert.deepEqual(plan.vault, []);
  assert.equal(plan.gated.length, 2);
  assert.ok(plan.gated.every(item => /not known yet/.test(item.reason)));
});

test('a credential no declared routine reads is not caught by the alignment gate', () => {
  // The gate exists for tokens a live body could be carrying. A purely
  // edge-side credential cannot be, so it must not be held hostage.
  const plan = deriveTopUp({
    edgeReads: new Set(['SOME_EDGE_ONLY_KEY']),
    vaultReads: new Set(),
    edgePropagated: new Set(),
    vaultPropagated: new Set(),
    availableEnv: new Set(['SOME_EDGE_ONLY_KEY']),
    aligned: null,
  });
  assert.deepEqual(plan.edge, ['SOME_EDGE_ONLY_KEY']);
  assert.deepEqual(plan.gated, []);
});
