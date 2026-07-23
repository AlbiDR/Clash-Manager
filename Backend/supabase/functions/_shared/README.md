// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# _shared

> The common kernel every Edge Function is built on: the request handler, Clash Royale API access, secret loading, and validation schemas.

**Imported by:** all five Edge Functions. Imports nothing from them.

## Responsibilities

- Wrap each function in a single request handler that enforces CORS, bearer auth, payload validation, and telemetry.
- Call the Clash Royale API through a rotating pool of keys, with backoff and concurrency limits.
- Load secrets from Supabase Vault into the environment at startup.
- Define the Valibot schemas that guard every payload.

## Contents

| File | Role |
| :--- | :--- |
| `protocol.ts` | The shared request handler (`clinicalServe`): CORS, bearer auth, Valibot validation, and telemetry around every function. |
| `muscle.ts` | Clash Royale API access: `fetchWithRotation` (random-start key rotation + exponential backoff) and `processBatch` (concurrency-limited fan-out via `p-limit`). |
| `vault.ts` | Loads secrets from Supabase Vault into `Deno.env` at function start (`get_vault_secret` RPC, with an env fallback). |
| `utils.ts` | Shared helpers: `normalizeTag`, `normalizeRarity`, and `calculateRpos` (the raw recruit potential score). |
| `config.ts` | Tunable thresholds, batch limits, and discovery keywords. No inline magic numbers elsewhere. |
| `schemas.ts` | Barrel that re-exports the three schema modules below. |
| `royaleSchemas.ts` | Valibot schemas for Clash Royale API responses. |
| `rpcSchemas.ts` | Valibot schemas for database RPC payloads (sync rows, scanner context). |
| `substrateSchemas.ts` | Valibot schemas for orchestration state, telemetry, the key pool, and Vault secrets. |
| `types.ts` | Shared TypeScript types (audit entries, ingestion results, recruit sync DTOs). |

## Gotchas

- This is Layer 1: keep it stateless and free of feature-specific logic.
- No data may enter a function without passing a schema defined here.

## See also

- [Backend README](../../../README.md) - how the functions fit together
- Imported by: [`ingest-royale-data`](../ingest-royale-data/README.md) | [`headhunter-scanner`](../headhunter-scanner/README.md) | [`query-royale-api`](../query-royale-api/README.md) | [`fetch-player-battlelog`](../fetch-player-battlelog/README.md) | [`sync-player-cards`](../sync-player-cards/README.md)
- Tests: [`shared-tests/`](shared-tests)
