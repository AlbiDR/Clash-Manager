// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# Ingestion Gatekeeper Engine (@backend)

The **Clinical Ingestion Kernel**. A Deno-native Edge Function responsible for the authoritative synchronization of clan telemetry, member performance, and competitive battle history into the Clash Manager substrate.

---

## Purpose
The Ingestion Gatekeeper (Layer 5 Control) orchestrates the primary synchronization protocol between the Supercell Royale API and the Supabase backend. It enforces a strict **Hexa-Stage Synchronization Protocol** to ensure that data ingestion is atomic, validated, and resilient to external API fluctuations.

## Architectural Context
- **Layer**: Layer 5 (Control) / Layer 4 (Orchestration)
- **Role**: Gatekeeper & Ingestion Orchestrator.
- **Import Boundaries**:
    - **Allowed**: Can import from `@shared` (protocols, schemas, types).
    - **Axiom**: Acts as the primary entry point for administrative data synchronization, triggered by the PWA or internal automated cycles.

## The Clinical Hexa-Stage Protocol
Ingestion is performed as a sequential pipeline, decomposed into six logical stages to maintain structural purity and facilitate granular audit logging. To optimize execution, these conceptual stages are orchestrated into three primary execution blocks in the `pipeline.ts` kernel.

### S1: Discovery (Execution Block 1)
**Objective**: identify potential recruits.
- Harvests fresh candidates from high-fidelity tournament anchors.
- Pre-populates the discovery buffer before the primary clan sync begins.

### S2 - S5: Clan Synchronization (Execution Block 2)
**Objective**: synchronize clan identity, residents, and competitive history.
- **S2: Clan Profile**: Atomic synchronization of clan-level telemetry (trophies, location, requirements). Updates the authoritative `drivers.clans` SSOT.
- **S3: Roster Sync**: Full-pool synchronization of active member telemetry. Resolves member transitions (joins/leaves) and updates the `drivers.members` substrate.
- **S4: River Race**: Extraction of current River Race standings and task completion metrics. Updates the `drivers.war_activity` daily logs.
- **S5: War History**: Ingests the clan's River Race log (most recent 12 war weeks) via `/clans/{tag}/riverracelog?limit=12`. Archives per-week clan-level standings (rank, fame, clan points) in `drivers.war_history`.

### S6: Deep Depth (Execution Block 3)
**Objective**: competitive scoring enrichment.
- Extracts a rolling battle-log window (capped by the Royale API at ~25 most-recent battles) for every resident.
- Provides the high-precision data required for PeS/RPeS performance scoring in `drivers.player_battles`.

---

## Technical Standards & Safety
- **Validation Boundary**: Implements strict `v.safeParse` validation using Valibot for all inbound Royale API payloads. Enforces zero-trust boundaries via standardized schemas (`TelemetrySchema`, `KeyPoolSchema`, `VaultSecretSchema`) centralized in `_shared/schemas.ts`. Malformed or unexpected data shapes are rejected at the gate to prevent substrate corruption.
- **RPC Orchestration**: Delegates persistence logic to specialized database RPCs (e.g., `ingest_raw_clan_profile`, `ingest_raw_war_log`) to maintain persistence ignorance in the Edge Layer.
- **Timeout Resilience**: Each stage is wrapped in a deterministic 10-minute timeout to prevent zombie execution and ensure predictable resource consumption in the Deno environment.
- **Clinical Auditing**: Dispatches real-time audit logs and progress heartbeats to the `governance_report` view, providing full transparency into pipeline health and execution metrics.
- **Key Farm Integration**: Leverages the concurrent `ROYALE_API_KEYS` farm to maximize throughput during deep-depth battle log extraction.
