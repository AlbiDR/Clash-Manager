// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# fetch-player-battlelog

> Fetches a single player's freshest battle log by querying every API key in parallel and returning the most recent result.

**Trigger:** on demand (diagnostics, PWA lookups) | **Auth:** internal bearer or Supabase anon key | **Persists:** nothing

## What it does

The RoyaleAPI proxy caches responses per node, so different keys can return different levels of freshness. To surface the newest data, this function:

1. Resolves the full pool of Clash Royale API keys from the Vault.
2. Requests the player's battle log across all keys at once.
3. Parses the `battleTime` of every successful response.
4. Returns the single most recent log found.

## Contents

| File | Role |
| :--- | :--- |
| `index.ts` | The parallel fan-out and freshness selection, behind the shared handler. |
| `client.ts` | Supabase service client. |

## Gotchas

- Timestamps are parsed defensively; a malformed `battleTime` is discarded rather than allowed to crash the request.

## See also

- [`_shared`](../_shared/README.md) | [Backend README](../../../README.md)
- Related functions: [`ingest-royale-data`](../ingest-royale-data/README.md) - the pipeline's deep-depth stage also fetches battle logs for all tracked members on a schedule | [`headhunter-scanner`](../headhunter-scanner/README.md) - the shadow-scout stage (S1) also calls `/players/{tag}/battlelog` for lead discovery
