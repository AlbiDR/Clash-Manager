// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# Battlelog Proxy Engine (@backend)

The **Diagnostic Fetch Kernel**. A Deno-native Edge Function responsible for secure, high-freshness retrieval of live player battle logs directly from the Clash Royale API.

---

## Purpose
The Battlelog Proxy (Layer 5 Control) provides a secure gateway for fetching real-time battle data. Unlike the primary ingestion pipeline which focuses on persistence, this proxy is optimized for **data freshness** and **diagnostic transparency**, ensuring that leadership can verify the most recent activity of any player on demand.

## Architectural Context
- **Layer**: Layer 5 (Control)
- **Role**: Secure Diagnostic Proxy.
- **Import Boundaries**:
 - **Allowed**: Can import from `@shared` (protocols, schemas).
 - **Usage**: Primarily consumed by testing utilities and high-fidelity diagnostic dashboards in the PWA.

## Parallel Fan-Out Strategy
To maximize the probability of surfacing the most recent battle data (bypassing stale proxy node caches), the engine implements a **Parallel Fan-Out Protocol**:

1. **Key Farm Resolution**: Dynamically resolves the full pool of available Royale API keys from the secure vault, utilizing the standardized `KeyPoolSchema` for authoritative resolution.
2. **Concurrent Dispatch**: Executes the battle log request across **all** resolved keys simultaneously.
3. **Freshness Arbitration**: Each proxy node (assigned to a specific key) may return a different cache state. The engine parses the `battleTime` of every successful response.
4. **Authoritative Selection**: Selects and returns the single most recent battle log identified across the entire fan-out pool.

---

## Technical Standards & Safety
- **Validation Boundary**: Enforces zero-trust boundaries via strict `v.safeParse` validation using the `RoyaleBattleLogSchema` and `PayloadSchema` to ensure both ingress and external API data remains type-safe.
- **BattleTime Engine**: Implements a defensive `parseBattleTime` engine utilizing regex validation (`/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/`) and explicit error narrowing for `Temporal.Instant.from`, preventing runtime crashes from malformed external payloads.
- **Key Farm Resolution**: Leverages the standardized `KeyPoolSchema` for clinical normalization of the Royale API key pool.
- **Sanitized Rotation**: Automatically handles key formatting and bearer token sanitization to ensure reliable communication with the Royale API proxy.
- **Clinical Protocol**: Wrapped in the `clinicalServe` utility for standardized authorization (Bearer/Anon), error handling, and telemetry.
- **Threat Mitigation**: Hardened against key pool exhaustion and malformed API responses via descriptive error granularity and mandatory [THREAT:] / [DECISION LOG] annotations.
