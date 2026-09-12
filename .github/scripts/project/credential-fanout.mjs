// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * ============================================================================
 * MODULE: CREDENTIAL FAN-OUT
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Answers one question with a number: to rotate credential X, how
 * many places must a human edit by hand?
 *
 * WHY THIS EXISTS
 * The stated goal is that rotating a credential means changing it in exactly
 * one place, GitHub Secrets, and everything else derives from it. Nothing
 * measured whether that was true. deploy-supabase.yml already propagates SOME
 * names to the edge runtime and SOME to Vault, by two separate hardcoded lists
 * written at different times, and neither list is checked against the names
 * that are actually read. A name can be added to a consumer and to neither
 * list, and the only symptom is that a rotation silently half-lands.
 *
 * THE COUNT IS THE POINT
 * Reading a credential in seven places is fine when all seven derive from one
 * store. What costs a rotation is a STORE that holds an independent copy. So
 * this counts stores that must be edited by hand, never read sites, and the
 * target for every credential is 1: GitHub Secrets and nothing else.
 *
 * NO VALUE IS EVER READ
 * Every input here is a NAME harvested from source text. This module cannot
 * read a credential's value, in any channel, by construction.
 * ============================================================================
 */

/**
 * Names Supabase injects into every edge function's environment on its own.
 * A platform contract, not a threshold: these are supplied by the provider and
 * are not settable, so a consumer reading one costs a rotation nothing.
 * Source: Supabase edge function runtime documentation.
 */
export const PLATFORM_INJECTED = new Set([
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_DB_URL',
]);

/** Where a copy of a credential can live, and what it costs to change one. */
export const STORE = {
  GITHUB: 'GitHub Secrets',
  EDGE: 'Supabase edge runtime',
  VAULT: 'Supabase Vault',
  LIVE_BODY: 'a live function body',
};

const NAME = '[A-Z][A-Z0-9_]{2,}';

/** Every `secrets.X` reference: the name is stored in GitHub Secrets. */
export function parseGithubSecrets(workflowSources) {
  const names = new Set();
  for (const source of workflowSources) {
    for (const match of source.matchAll(new RegExp(`secrets\\.(${NAME})`, 'g'))) names.add(match[1]);
  }
  names.delete('GITHUB_TOKEN'); // Minted per run by Actions; there is nothing to rotate.
  return names;
}

/**
 * Names the deploy pushes into the edge runtime via `supabase secrets set`.
 *
 * Returns null when no such call is found at all, rather than an empty set. An
 * empty set and "the parse broke" are the same output otherwise, and the
 * second one would report every credential as needing a manual edit it does
 * not need, which is how an audit gets ignored.
 */
export function parseEdgePropagation(workflowSources) {
  let sawCall = false;
  const names = new Set();
  for (const source of workflowSources) {
    for (const line of source.split('\n')) {
      if (!/supabase\s+secrets\s+set/.test(line)) continue;
      sawCall = true;
      for (const match of line.matchAll(new RegExp(`(${NAME})=`, 'g'))) names.add(match[1]);
    }
  }
  return sawCall ? names : null;
}

/**
 * Names the deploy upserts into Vault. The workflow drives this with a shell
 * loop over a literal list, so the list is read from the loop header.
 */
export function parseVaultPropagation(workflowSources) {
  let sawLoop = false;
  const names = new Set();
  for (const source of workflowSources) {
    for (const match of source.matchAll(/for\s+KEY\s+in\s+((?:"[A-Z0-9_]+"\s*)+)/g)) {
      sawLoop = true;
      for (const name of match[1].matchAll(/"([A-Z0-9_]+)"/g)) names.add(name[1]);
    }
  }
  return sawLoop ? names : null;
}

/** Names read at the edge runtime. */
export function parseEdgeReads(functionSources) {
  const names = new Set();
  for (const source of functionSources) {
    for (const match of source.matchAll(new RegExp(`Deno\\.env\\.get\\(\\s*['"\`](${NAME})`, 'g'))) names.add(match[1]);
  }
  return names;
}

/**
 * Which credentials each declared routine reads out of Vault, keyed by the
 * routine's qualified name.
 *
 * Per routine rather than a flat set, because a live body carrying a literal
 * has to be attributed to SOMETHING, and the audit must never read a value to
 * find out which. The declared version of the same function names what it
 * needs, so that is the attribution: honest, and derived from tracked source.
 */
export function parseVaultReadsByRoutine(migrationSources) {
  const byRoutine = new Map();
  const header = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([\w.]+)\s*\(/gi;
  for (const source of migrationSources) {
    const starts = [...source.matchAll(header)];
    for (let index = 0; index < starts.length; index += 1) {
      const name = starts[index][1].toLowerCase();
      const body = source.slice(starts[index].index, index + 1 < starts.length ? starts[index + 1].index : undefined);
      const names = new Set();
      for (const match of body.matchAll(new RegExp(`get_vault_secret\\(\\s*'(${NAME})'`, 'g'))) names.add(match[1]);
      if (!names.size) continue;
      const existing = byRoutine.get(name) || new Set();
      for (const item of names) existing.add(item);
      byRoutine.set(name, existing);
    }
  }
  return byRoutine;
}

/** Names read out of Vault by any declared function body. One parser, folded. */
export function parseVaultReads(migrationSources) {
  const names = new Set();
  for (const names_ of parseVaultReadsByRoutine(migrationSources).values()) {
    for (const name of names_) names.add(name);
  }
  return names;
}

/**
 * Builds the per-credential rotation cost.
 *
 * `liveLiteralRoutines` comes from the drift snapshot: routines whose LIVE body
 * carries a credential-shaped literal. Those bodies are an independent copy of
 * whatever they embed, so they are a store like any other, and the one store a
 * deploy cannot update.
 */
export function computeFanout({
  githubSecrets,
  edgePropagated,
  vaultPropagated,
  edgeReads,
  vaultReads,
  liveLiteralRoutines = [],
  vaultReadsByRoutine = new Map(),
}) {
  const universe = new Set([...githubSecrets, ...edgeReads, ...vaultReads]);
  const unknown = [];
  if (edgePropagated === null) unknown.push('No `supabase secrets set` call was found in any workflow, so edge propagation could not be determined.');
  if (vaultPropagated === null) unknown.push('No Vault sync loop was found in any workflow, so Vault propagation could not be determined.');

  const entries = [];
  for (const name of [...universe].sort()) {
    const stores = [];
    const derived = [];

    if (githubSecrets.has(name)) stores.push(STORE.GITHUB);

    if (edgeReads.has(name)) {
      if (PLATFORM_INJECTED.has(name)) derived.push(`${STORE.EDGE} (injected by the platform)`);
      else if (edgePropagated === null) stores.push(`${STORE.EDGE} (propagation unknown)`);
      else if (edgePropagated.has(name)) derived.push(`${STORE.EDGE} (set by the deploy)`);
      else stores.push(STORE.EDGE);
    }

    if (vaultReads.has(name)) {
      if (vaultPropagated === null) stores.push(`${STORE.VAULT} (propagation unknown)`);
      else if (vaultPropagated.has(name)) derived.push(`${STORE.VAULT} (set by the deploy)`);
      else stores.push(STORE.VAULT);
    }

    // A live body carrying a literal is an independent copy, and the one store
    // no deploy can update. It is attributed to this credential only when the
    // DECLARED version of that same routine reads this credential, because the
    // value itself is never read and cannot be matched directly.
    const embeddedIn = liveLiteralRoutines.filter(routine => vaultReadsByRoutine.get(routine)?.has(name));
    if (embeddedIn.length) stores.push(`${STORE.LIVE_BODY}: ${embeddedIn.join(', ')}`);

    // GitHub Secrets is the intended single point, so it is not overhead.
    const manual = stores.filter(store => store !== STORE.GITHUB);
    entries.push({ name, stores, derived, manualWritePoints: manual.length, manual });
  }

  entries.sort((a, b) => b.manualWritePoints - a.manualWritePoints || a.name.localeCompare(b.name));
  return { entries, unknown, worst: entries.length ? entries[0].manualWritePoints : 0 };
}

export function render(report) {
  const lines = ['Credential rotation cost', ''];
  if (report.unknown.length) {
    lines.push('COULD NOT BE DETERMINED (treated as a manual edit, never as a pass):');
    for (const item of report.unknown) lines.push(`  - ${item}`);
    lines.push('');
  }

  lines.push('Places a human must edit to rotate, beyond GitHub Secrets. The target is 0.');
  lines.push('');
  for (const entry of report.entries) {
    lines.push(`  ${String(entry.manualWritePoints).padStart(2)}  ${entry.name}`);
    for (const store of entry.manual) lines.push(`        MANUAL   ${store}`);
    for (const store of entry.derived) lines.push(`        derived  ${store}`);
  }

  lines.push('');
  lines.push(report.worst === 0
    ? 'Every credential derives from GitHub Secrets. Rotating one is a single edit.'
    : `Worst case: ${report.worst} manual edits. Until that is 0, a rotation can half-land with no error anywhere.`);
  return `${lines.join('\n')}\n`;
}
