// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# Backend Kernel (_shared) : Core Logic Substrate

The **System Kernel** for the distributed backend. A collection of pure logic engines, validation boundaries, and infrastructure brokers that form the foundational substrate for all Supabase Edge Functions.

---

## Purpose
The Shared Layer (Layer 1) provides the essential infrastructure required for the backend ingestion and orchestration pipelines. It standardizes authorization, validation, and telemetry, ensuring that all Edge Functions adhere to a "Clinical" execution protocol.

## Architectural Context
- **Layer**: Layer 1 (@core)
- **Role**: Backend Kernel. Zero dependencies on feature-specific logic or higher layers.
- **Import Boundaries**:
 - **Allowed**: Can import from sibling modules within `_shared/`.
 - **Forbidden**: Strictly forbidden from importing from specific Edge Function implementations or higher-level business orchestration.

## Core Modules

### Clinical Protocol (`protocol.ts`)
Standardizes authorization, validation, and microscopic telemetry across all Edge Functions.
- **Authorization Guard**: Validates internal service bearer tokens to secure service-to-service communication.
- **Validation Boundary**: Enforces strict Valibot schemas on inbound payloads at the entry point.
- **Microscopic Telemetry**: Orchestrates the standard `report_telemetry` and `report_heartbeat` lifecycle, tracking durations and audit logs for every execution.

### Validation Boundaries (`schemas.ts`)
The authoritative Single Source of Truth for backend validation. This monolithic module is decomposed into domain-specific sub-modules to ensure maintainability and adhere to the Single Responsibility Principle (SRP).
- **Royale API Schemas (`royaleSchemas.ts`)**: Standardizes raw data from external sources (Clash Royale API) into clinical relational payloads.
- **RPC Schemas (`rpcSchemas.ts`)**: Defines strict contracts for data crossing the Supabase RPC boundary, including sync payloads and scanner contexts.
- **Substrate Schemas (`substrateSchemas.ts`)**: Provides validation for internal telemetry, key farm hygiene (`KeyPoolSchema`), and secret hardening (`VaultSecretSchema`).

### Hardware Brokers (`muscle.ts`)
The high-concurrency ingestion engine (Native Muscle).
- **Key Rotation**: Implements a resilient "Key Farm" strategy featuring linear probing and exponential backoff to maximize uptime against Royale API rate-limiting.
- **Batch Processing**: Orchestrates high-throughput parallel tasks using strict concurrency limits to prevent Edge Function resource exhaustion.

### Secret Brokerage (`vault.ts`)
Secured access to the Supabase Vault.
- **Prioritized Retrieval**: Brokers access to decrypted secrets via the `get_vault_secret` RPC, with a transparent fallback to Deno environment variables.
- **Normalization**: Ensures all retrieved secrets are passed through a validation boundary before use.

### Backend Utilities (`utils.ts`)
Centralized normalization and text processing logic for the backend substrate.
- **Tag Normalization**: Standardizes player and clan tags to uppercase format with a mandatory hash prefix to maximize cache hits and prevent substrate duplication.
- **Rarity Mapping**: Maps raw lowercase rarity strings from the Royale API to standardized Title-Case names, ensuring relational schema and UI consistency.
- **RPoS Calculation**: Implements the authoritative Raw Recruiter Point of Satisfaction (RPoS) formula used for recruitment prioritization.

### Universal Types (`types.ts`)
Authoritative TypeScript interfaces used across the entire backend substrate.
- **Audit Logging**: Defines the standard `AuditEntry` contract for clinical telemetry.
- **Domain Models**: Centralizes definitions for ingestion results and scanner statistics.
- **Recruit Synchronization**: Provides the `RecruitSyncRow` DTO for standardized bulk ingestion across pipelines.

### Shared Configuration (`config.ts`)
The authoritative source for backend business rules and operational thresholds.
- **Batch Limits**: Defines hard caps for profiling (`PROFILER_BATCH_CEILING`) and re-scanning (`RESCAN_BATCH_LIMIT`) to ensure predictable execution.
- **Discovery Parameters**: Centralizes keywords and limits for tournament and battle-log harvesting.
- **Harvesting Thresholds**: Centralizes operational constants for query-royale-api leaderboards, including target floor (`TARGET_HARVEST_FLOOR`), query limit (`PLAYER_LEADERBOARD_LIMIT`), concurrent epoch limit (`MAX_HARVEST_EPOCHS`), and top geographic country lists (`TOP_COUNTRY_IDS`).

---

## Integration Standards
- **Purity Axiom**: Logic in this layer must remain stateless and deterministic where possible.
- **Validation Boundaries**: No data enters an Edge Function without passing through the Valibot schemas defined here.
- **Fail-Fast Purity**: Protocol handlers must detect errors (e.g., auth failure, malformed payload) and halt execution immediately to prevent corrupted state propagation.
