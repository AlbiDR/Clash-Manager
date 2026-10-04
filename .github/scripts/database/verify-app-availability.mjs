// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

// Match the app's foreground request budget. Deployment success must imply
// that a fresh client can read data within that budget, not only upload code.
const REQUEST_TIMEOUT_MS = 25_000;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 10_000;
const APP_VIEWS = ['roster_view', 'headhunter_view', 'recruit_blacklist_view'];

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

  // Use the same public key and schema as the deployed PWA. A management SQL
  // query or service-role read would miss revoked view/function privileges.
  await Promise.all(APP_VIEWS.map(async (view) => {
    const response = await fetchImpl(`${url.replace(/\/$/, '')}/rest/v1/${view}?select=*&limit=1`, {
      headers: { apikey: key, 'Accept-Profile': 'features', 'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Anonymous ${view} read failed: HTTP ${response.status}`);
    if (!Array.isArray(await response.json())) throw new Error(`${view} did not return a row array.`);
  }));
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
      console.log('App availability verified: database, REST, and anonymous roster/recruit/blacklist reads.');
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
