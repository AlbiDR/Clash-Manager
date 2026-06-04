// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# Core Layer (@core) -- Agnostic Kernel

The **System Kernel**. A collection of pure logic engines, infrastructure singletons, and agnostic utilities that form the foundational substrate of the Clash Manager client.

---

## Purpose
The Core Layer (Layer 1) provides the essential infrastructure required for the application to function. It is designed to be domain-aware but framework-ignorant where possible, serving as the authoritative kernel for data transport, persistence, and state orchestration.

## Architectural Context
- **Layer**: Layer 1 (@core)
- **Role**: Agnostic Kernel. Zero dependencies on higher layers (Shared, Features, App).
- **Import Boundaries**:
  - **Allowed**: Can import from Layer 0 (`@substrate`).
  - **Forbidden**: Strictly forbidden from importing from Layer 2 (`@shared`), Layer 3 (`@features`), or Layer 4 (`@app`).

## Directory Structure

### API Clients (`/api`)
The authoritative transport layer for the Supabase binary stack.
- **SupabaseClient.ts**: The primary gateway for remote data operations. Orchestrates view-direct fetching and initial data hydration.
- **Specialized Clients**: Domain-specific orchestrators for RPC and Edge Function interactions:
  - `VoyageClient.ts`: Manages Clan Voyage activations and ledger fetching.
  - `RecruitClient.ts`: Manages headhunter recruitment and blacklist operations.
  - `ProfileClient.ts`: Brokered access to player card synchronization.
  - `MaintenanceClient.ts`: Triggers system-level janitor and maintenance cycles.
- **Data Schemas**: Decomposed Valibot schemas for domain-specific validation (e.g., `VoyageSchemas.ts`, `MemberSchemas.ts`).
- **Data Mappers**: Transformation logic for converting raw Supabase rows into Persistence-Ignorant Domain Models.

### Configuration (`/config`)
Static system constants and environment orchestration.
- **constants.ts**: Global thresholds, timeouts, and non-business identities.

### Services (`/services`)
Infrastructure singletons and Layer 1 state orchestrators.
- **StorageService.ts**: The persistence engine. Brokers access to IndexedDB via the `idbKernel` and manages high-fidelity caching.
- **useClashDataStore.ts**: The authoritative central store for high-integrity clan datasets.
- **useConnectivityManager.ts**: Resolves 8-tier system health and synchronization status.
- **useProgressiveList.ts**: Time-sliced rendering engine for high-density list stability.
- **useHaptics.ts / useWakeLock.ts**: Brokered access to hardware APIs.

### Theme Engine (`/theme`)
The visual DNA of the application.
- **Theme Injection**: Logic for HSL variable injection and dynamic theme swapping.
- **Icon Paths**: Centralized SVG path definitions for the `Icon.vue` primitive.

### Domain Types (`/types`)
Authoritative TypeScript interfaces and enums used across the entire application.

### Utility Kernels (`/utils`)
Pure, stateless logic engines and formatting primitives.
- **idbKernel.ts**: Low-level IndexedDB boilerplate and memory-fallback logic.
- **predictionMath.ts**: Weighted-average engines and historical performance projection.
- **formatters.ts**: Standardized sanitization and duration conversion logic.
- **bezier.ts**: Geometric calculations for trend visualization.

---

## Integration Standards
- **Deep Import Protocol**: To prevent barrel-related bundle bloat, Layer 1 modules (especially schemas and utils) should be imported directly from their respective files when consumed by higher layers.
- **Validation Boundaries**: All inbound data from external sources (Supabase, LocalStorage, IndexedDB) MUST be validated against a Valibot schema at the service or client entry point.
- **Persistence Ignorance**: Logic in this layer must remain decoupled from the storage mechanism. Domain models should not reflect the underlying database structure.
- **Fail-Fast Purity**: Kernels must detect errors at the earliest point and halt execution to prevent state corruption.
