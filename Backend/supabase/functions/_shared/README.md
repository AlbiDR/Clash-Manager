// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# _shared

> The common kernel every Edge Function is built on: the request handler, Clash Royale API access, secret loading, and validation schemas.

**Imported by:** [`ingest-royale-data`](../ingest-royale-data/README.md), [`headhunter-scanner`](../headhunter-scanner/README.md), [`query-royale-api`](../query-royale-api/README.md), [`fetch-player-battlelog`](../fetch-player-battlelog/README.md), and [`sync-player-cards`](../sync-player-cards/README.md) - all five Edge Functions. Imports nothing from them.

## Responsibilities

- Wrap each function in a single request handler that enforces CORS, bearer auth, payload validation, and telemetry.
- Call the Clash Royale API through a rotating pool of keys, with backoff and concurrency limits.
- Load secrets from Supabase Vault into the environment at startup.
- Define the Valibot schemas that guard every payload.

## Security Boundaries & Throttling Protocol

The request orchestrator (`protocol.ts`) implements several defense-in-depth mechanisms to protect the Supabase trust boundary and prevent server-side resource exhaustion:

### 1. Constant-Time Bearer Authorization
To eliminate timing leak vectors at the authentication gate, bearer tokens are normalized to a fixed 32-byte width via SHA-256 digest hashing before validation. Comparison is performed using a non-short-circuiting bitwise XOR accumulator. Every configured token is evaluated on every request, hiding matching positions and key farm pool sizes from timing side-channels.

### 2. Dual-Bucket Rate Limiting (Proxy-Aware)
Since public client-facing functions accept the public anon key (the PWA has no user authentication subsystem), volume-based throttling is enforced:
- **Proxy IP Extraction:** Extracts the caller IP by inspecting `x-forwarded-for` (first hop), `cf-connecting-ip` (Cloudflare), and `x-real-ip` headers in sequence.
- **Throttling Buckets:** Supports dual-bucket mapping:
  - *Per-IP Bucket:* Restricts total request volume from a single IP regardless of the targets queried.
  - *Per-IP-Target Bucket:* Restricts focused hammering of a specific player/clan tag from a single IP, preventing popular targets from being globally starved by a single abusive client.
- **Garbage Collection:** Opportunistically sweeps expired buckets once the in-memory Map exceeds the safety threshold (`RATE_LIMIT_BUCKET_SWEEP_THRESHOLD`), preventing unbounded memory growth.
- **Isolate Tradeoff:** Throttling uses an in-memory per-worker Map. While state is transient and resets on cold boots, this accepted tradeoff completely bypasses external store latency and coordination overhead per ADR KISS/YAGNI.

### 3. Error Propagation & Information-Disclosure Safeguards
To satisfy the Error Propagation and Readability Contracts (ADR Section IV), errors are never thrown as raw strings. The `errors.ts` module defines a closed union of stable `ProtocolErrorCode` types (`UNAUTHORIZED`, `METHOD_NOT_ALLOWED`, `MALFORMED_BODY`, `MALFORMED_PAYLOAD`, `RATE_LIMITED`, `TELEMETRY_UNAVAILABLE`, `INTERNAL_ERROR`), mapping each to its canonical HTTP status and a strict, client-safe message.
Any uncaught error or unclassified exception caught at the control surface is automatically processed by `classifyThrown()` and degraded to `INTERNAL_ERROR`. This completely eliminates the threat of information disclosure (such as database schemas, table topologies, or API key pool configurations) to external callers.

### 4. Opt-In Restricted CORS & Preflight Headers
To protect player and clan data exposure from malicious third-party web pages, functions queryable from browser JS use opt-in restricted CORS. Verified origin domains are matched dynamically against the configured allow-list and reflected back (avoiding the wildcard `*`), coupled with `Vary: Origin` headers for cache safety. Internal service-to-service cron triggers fallback to default CORS headers. OPTIONS preflight requests explicitly allow `authorization`, `content-type`, `apikey`, `x-client-info`, `cache-control`, and `pragma` headers to ensure compatibility with client wrappers.

### 5. Closed Payload Contract Guard
To enforce strict schema boundaries at the L5 control surface (ADR Section III), `protocol.ts` evaluates inbound JSON object payloads against schema entries reflected via `ObjectSchemaShapeSchema`. Top-level undeclared fields are immediately rejected before business logic invocation with a `MALFORMED_PAYLOAD` protocol error response containing `{ kind: 'undeclared_field', path: [fieldName] }` details.

## Contents

| File | Role |
| :--- | :--- |
| `protocol.ts` | The shared request handler (`clinicalServe`): CORS, bearer auth, Valibot validation, and telemetry around every function. |
| `errors.ts` | Typed Protocol Errors: `ProtocolError` class, error mappings, stable classifications, and client-safe serialization. |
| `muscle.ts` | Clash Royale API access: `fetchWithRotation` (random-start key rotation + exponential backoff) and `processBatch` (concurrency-limited fan-out via `p-limit`). |
| `vault.ts` | Loads secrets from Supabase Vault into `Deno.env` at function start (`get_vault_secret` RPC, with an env fallback). |
| `utils.ts` | Shared helpers: `normalizeTag`, `normalizeRarity`, and `calculateRpos` (the raw recruit potential score). |
| `config.ts` | Tunable thresholds, batch limits, and discovery keywords. No inline magic numbers elsewhere. |
| `schemas.ts` | Barrel that re-exports the three schema modules below. |
| `royaleSchemas.ts` | Valibot schemas for Clash Royale API responses. |
| `rpcSchemas.ts` | Valibot schemas for database RPC payloads (`PlayerSyncPayloadSchema` tag validation matching `RoyaleTagSchema`, `IngestionTargetsSchema` transforming `"drivers.*"` keys to bare `members`/`recruits`, `ShadowTargetSchema`, `StaleRecruitSchema`, `HeadhunterContextSchema`, `DiscoveryAnchorSchema`, `DiscoveryCacheItemSchema`, `RecruitFateSchema`). |
| `substrateSchemas.ts` | Valibot schemas for orchestration state, telemetry, the key pool, and Vault secrets. |
| `types.ts` | Shared TypeScript types (audit entries, ingestion results, recruit sync DTOs). |

## Gotchas

- This is Layer 1: keep it stateless and free of feature-specific logic.
- No data may enter a function without passing a schema defined here.

## See also

- [Backend README](../../../README.md) - how the functions fit together
- Imported by: [`ingest-royale-data`](../ingest-royale-data/README.md) | [`headhunter-scanner`](../headhunter-scanner/README.md) | [`query-royale-api`](../query-royale-api/README.md) | [`fetch-player-battlelog`](../fetch-player-battlelog/README.md) | [`sync-player-cards`](../sync-player-cards/README.md)
- Tests: [`shared-tests/`](shared-tests)
