// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * Sync-Migrations.ts
 * Clinical Self-Healing for Supabase Migration History
 *
 * Strategy:
 *   Uses `supabase migration repair --status reverted` (Management API, no direct
 *   DB connection required) to remove remote ghost versions — versions present in
 *   the remote migration history table but absent from the local migrations directory.
 *
 *   Version (timestamp) is the SSOT key. Name is intentionally ignored; the Supabase
 *   CLI itself matches by version only, and remote names can legitimately drift from
 *   local filenames when a migration was renamed after being applied.
 *
 *   This script is designed to be idempotent and safe to re-run.
 *   It must exit(0) on success or on graceful skips (non-repairable states).
 *   It must exit(1) only on hard failures that would corrupt the DB.
 */

const MIGRATIONS_DIR = path.join(process.cwd(), 'supabase/migrations');

// ---------------------------------------------------------------------------
// 1. Build the authoritative local version set (timestamps only)
// ---------------------------------------------------------------------------
const localFiles = fs.readdirSync(MIGRATIONS_DIR)
  .filter(f => f.endsWith('.sql'))
  .sort();

const localVersions = new Set<string>();
localFiles.forEach(file => {
  const match = file.match(/^(\d{14})_/);
  if (match) localVersions.add(match[1]);
});

console.log(`[INFO] Found ${localVersions.size} authoritative local migrations.`);

// ---------------------------------------------------------------------------
// 2. Parse remote migration state from `supabase migration list`
//    The CLI pretty-prints a table; we parse it line-by-line.
//    Format: "   <local_ver> | <remote_ver> | <timestamp>   "
//    A ghost appears as "                | <remote_ver> | ..."
// ---------------------------------------------------------------------------
console.log('[SYNC] Running Clinical Migration Sync...');

let listOutput = '';
try {
  listOutput = execSync('supabase migration list', {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
} catch (e: any) {
  // `supabase migration list` exits non-zero when ghosts are present.
  // Capture the output from stderr/stdout anyway.
  listOutput = (e.stdout ?? '') + (e.stderr ?? '');
  if (!listOutput.includes('|')) {
    console.warn('[WARNING] Could not fetch migration list. Delegating to direct native push...');
    process.exit(0);
  }
}

// Parse each data row: skip header and separator lines
const remoteVersions = new Set<string>();
const lines = listOutput.split('\n');
for (const line of lines) {
  // Match a row containing a pipe separator with 14-digit version columns
  const match = line.match(/^\s*(\d{14})?\s*\|\s*(\d{14})?\s*\|/);
  if (match) {
    const remoteVersion = match[2]?.trim();
    if (remoteVersion) remoteVersions.add(remoteVersion);
  }
}

if (remoteVersions.size === 0) {
  console.log('[INFO] No remote migration versions found in list output. Nothing to repair.');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 3. Identify ghost versions: remote-only, not in local directory
// ---------------------------------------------------------------------------
const ghosts = [...remoteVersions].filter(v => !localVersions.has(v));

if (ghosts.length === 0) {
  console.log('[SUCCESS] Migration history is synchronized. No ghosts detected.');
  process.exit(0);
}

console.log(`[SYNC] Detected ${ghosts.length} ghost migration(s). Repairing...`);
ghosts.forEach(v => console.log(`  Ghost: ${v}`));

// ---------------------------------------------------------------------------
// 4. Repair ghosts via `supabase migration repair --status reverted`
//    This uses the Management API — no direct DB connection required.
// ---------------------------------------------------------------------------
try {
  execSync(
    `supabase migration repair --status reverted ${ghosts.join(' ')}`,
    { stdio: 'inherit' }
  );
  console.log(`[SUCCESS] Autonomous self-healing completed (${ghosts.length} ghost(s) repaired).`);
} catch (error) {
  console.error('[ERROR] Failed to repair ghost migrations:', error);
  process.exit(1);
}
