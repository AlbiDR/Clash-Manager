// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

// Match the app's foreground request budget. Deployment success must imply
// that a fresh client can read data within that budget, not only upload code.
const REQUEST_TIMEOUT_MS = 25_000;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 10_000;
// Probe the client's snapshots, not computed scoring views: an availability
// check must not itself repeat the expensive work that snapshots avoid.
export const APP_READS = [
  { relation: 'roster_materialized', query: 'select=*&order=raw_performance_score.desc.nullslast,performance_score.desc.nullslast', requiresRows: true },
  { relation: 'headhunter_materialized', query: 'select=*&order=raw_potential_score.desc&limit=250' },
  { relation: 'recruit_blacklist_view', query: 'select=player_tag' },
];

export async function verifyAppAvailability({ projectId, url, key, token, fetchImpl = fetch }) {
  if (!projectId || !url || !key || !token) {
    throw new Error('App availability check requires the project ID, PWA URL and publishable key, and management token.');
  }

  const health = await fetchImpl(
    `https://api.supabase.com/v1/projects/${projectId}/health?services=db&services=rest`,
    { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
  );
  if (!health.ok) throw new Error(`Service health request failed: HTTP ${health.status}`);
  const services = await health.json();
  for (const name of ['db', 'rest']) {
    const service = Array.isArray(services) && services.find((item) => item.name === name);
    if (!service || service.healthy !== true) {
      throw new Error(`Supabase ${name} is unavailable to the app.`);
    }
  }

  const publication = await fetchImpl(`https://api.supabase.com/v1/projects/${projectId}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ read_only: true, query: `
      SELECT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'drivers' AND tablename = 'recruit_blacklist'
      ) AND has_schema_privilege('anon', 'drivers', 'USAGE')
        AND has_table_privilege('anon', 'drivers.recruit_blacklist', 'SELECT')
        AS blacklist_realtime_ready;
    ` }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!publication.ok) throw new Error(`Blacklist publication check failed: HTTP ${publication.status}`);
  const publicationRows = await publication.json();
  if (!Array.isArray(publicationRows) || publicationRows[0]?.blacklist_realtime_ready !== true) {
    throw new Error('Blacklist Realtime publication or anonymous read access is missing.');
  }

  // Use the same public key and schema as the deployed PWA. A management SQL
  // query or service-role read would miss revoked view/function privileges.
  // One shared deadline bounds the entire data pass, including response bodies.
  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]);
  const reads = APP_READS.map(async ({ relation, query, requiresRows }) => {
    const response = await fetchImpl(`${url.replace(/\/$/, '')}/rest/v1/${relation}?${query}`, {
      headers: { apikey: key, 'Accept-Profile': 'features', 'Cache-Control': 'no-cache' },
      signal,
    });
    if (!response.ok) throw new Error(`Anonymous ${relation} read failed: HTTP ${response.status}`);
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error(`${relation} did not return a row array.`);
    if (requiresRows && rows.length === 0) throw new Error(`${relation} returned no members; app population is unavailable.`);
    if (rows.some(row => typeof row?.player_tag !== 'string' || !row.player_tag.trim())) {
      throw new Error(`${relation} returned rows without player identities.`);
    }
  });
  try {
    await Promise.all(reads);
  } catch (error) {
    // Finish cancelling the failed pass before main can retry. Promise.all's
    // early rejection alone leaves sibling fetches consuming the old budget.
    controller.abort(error);
    await Promise.allSettled(reads);
    throw error;
  }
}

async function main() {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      await verifyAppAvailability({
        projectId: process.env.PROJECT_ID,
        url: process.env.VITE_SUPABASE_URL,
        key: process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        token: process.env.SUPABASE_ACCESS_TOKEN,
      });
      console.log('App availability verified: database, REST, blacklist publication, populated roster snapshot, and anonymous recruit/blacklist reads.');
      return;
    } catch (error) {
      console.error(`App availability attempt ${attempt}/${MAX_ATTEMPTS}: ${error.message}`);
      if (attempt === MAX_ATTEMPTS) {
        process.exitCode = 1;
        return;
      }
      await delay(RETRY_DELAY_MS);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
