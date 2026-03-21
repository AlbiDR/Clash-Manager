// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# Milestone: Worker-Led Data Hub Transition (Deep Delegation)

## 1. Goal Description
The objective is to pivot the primary data synchronization pipeline from a Google Sheets/GAS-driven architecture to a **Render Worker-driven Hub**. This fulfills the **Deep Delegation Strategy** (ADR Section IV) by offloading heavy computational and network lifting from the restricted GAS environment to the high-concurrency Render Muscle.

### Architectural Health & Stability
*   **Worker Polling (Active Hub):** Polls the Royale API every 5 minutes. Costs 0 GAS quota.
*   **GAS Archival Sync (L4):** `Orchestrator_RegisterLifecycleTriggers` will be adjusted to a **30-minute cadence** (down from 60m). This ensures Layer 2 persistence (Google Sheets) remains an authoritative audit trail without risking Spreadsheet lock collisions or trigger runtime exhaustion.
*   **Clinical Isolation:** The PWA remains "Persistence Ignorant" (ADR Section III), consuming a unified Matrix DTO regardless of whether it originates from the Hub (L1) or the Spreadsheet (L2).

## 2. Structural Unitary Alignment

### A. Core Engine (Layer 1: `@kernel`)
To maintain the **Single Source of Truth (SSOT)** and **DRY Principle**:
*   **[NEW] `Payload_Compressor.ts` (GAS) / `PayloadCompressor.ts` (Worker):** A shared logic engine that transforms raw Royale API data into the optimized Matrix DTO. This ensures 1:1 format parity.
*   **[NEW] `Data_Schemas.ts`:** Centralized Valibot schemas to enforce the **Validation Boundary** at both the Worker entry point and the PWA API client.

### B. Hub Service (Layer 1: `@kernel` - Worker)
*   **`ClanAggregatorService.ts`:** Decoupled service extracted from the Layer 5 control surface (`index.ts`). It handles multi-resource aggregation solely as a logic engine.
*   **`DataHubService.ts`:** A singleton state-manager in the Worker that holds the `lastKnownGoodPayload`.

### C. Client Brokering (Layer 1: `@kernel` - PWA)
*   **`GasClient.ts` Refactor:** Implements a "Service Brokering" logic. It queries the Worker Hub first (preferring high-frequency data) and seamlessly falls back to the GAS Control Layer (Layer 5) if the Hub pings are unhealthy or exceed a 3000ms timeout.

## 3. Comprehensive Implementation Blueprint

### Phase 1: Shared Logic Execution (Layer 1)
- [ ] **1.1: Licensing & Headers:** Ensure all new files carry the authoritative SPDX/Copyright header.
- [ ] **1.2: Payload Extraction:** Relocate Matrix generation from `Webapp_Controller.ts` to `Payload_Compressor.ts`.
- [ ] **1.3: Schema Hardening:** Define `RoyalePayloadSchema` using Valibot in `Data_Schemas.ts`.
- [ ] **1.4: Unit Tests:** Add Vitest specs for `Payload_Compressor` with 100% coverage requirement (ADR Section VIII).

### Phase 2: Worker Muscle Implementation (Layer 1 & 5)
- [ ] **2.1: Service Extraction:** Move `/clan/full` logic into `ClanAggregatorService.ts`.
- [ ] **2.2: The Hub Daemon:** Implement `setInterval` (5m) in `index.ts` to invoke `updateHubState()`.
- [ ] **2.3: Control Surface:** Expose `GET /public/payload` in `index.ts`, returning `DataHubService.getLatest()`.
- [ ] **2.4: Validation Boundary:** Wrap the Hub update in a `validatePayload()` check to prevent corrupting the memory state.

### Phase 3: PWA Integration (Layer 1 & 4)
- [ ] **3.1: Client Brokering:** Refactor `GasClient.ts` to include `fetchHubPayload()`.
- [ ] **3.2: Timeout Circuit Breaker:** Implement a 3s deadline. On failure, trigger `loadGasPayload()`.
- [ ] **3.3: Mutation Tunneling:** Ensure functions like `saveDismissal()` continue to target GAS directly to maintain transactional integrity.

### Phase 4: GAS Trigger Optimization (Layer 4)
- [ ] **4.1: Trigger Recalibration:** Update `Orchestrator.ts` triggers from `.everyHours(1)` to `.everyMinutes(30)`.
- [ ] **4.2: Manual Re-Registry:** Perform a one-time execution of `registerLifecycleTriggers()` via the GAS console to commit the new timer manifests.

## 4. Verification & Stabilization
*   **Symmetry Test:** Use a comparison script to verify `JSON.stringify(WorkerOutput) === JSON.stringify(GasOutput)`. 
*   **Quota Guard Audit:** Verify that `Network.quotaCheck()` is appropriately bypassed for Worker requests but strictly enforced for GAS fallback requests.
*   **E2E Fallback:** Playwright test (L5) simulating a Worker 503 error, asserting that the PWA successfully renders data from the GAS secondary source.
