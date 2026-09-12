// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  computeFanout, parseEdgePropagation, parseEdgeReads, parseGithubSecrets,
  parseVaultPropagation, parseVaultReads, parseVaultReadsByRoutine, render,
} from './credential-fanout.mjs';

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
