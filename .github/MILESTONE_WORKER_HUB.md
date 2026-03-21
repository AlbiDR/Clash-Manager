// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# Milestone: Worker-Led Data Hub Transition (Architectural Honesty)

This document is the **Single Source of Truth** and a comprehensive **Standalone Directive** for the transition to a **Worker-Led Data Hub**. It is designed for execution by an AI agent, following the **CleanStack Architecture (ADR)**.

---

## I. Mission & Strategic Context
Pivot the primary data synchronization from a GAS-driven model to a **Worker-driven Hub**. This fulfills the **Deep Delegation Strategy** (ADR Section IV) by offloading heavy aggregation and matrix compression to the Render Worker while relegating GAS to a "Dumb Raw Storage" role.

- **Current Model:** 60/30-minute GAS sync. PWA reads from a cached JSON (`v13.1.0`).
- **Target Model:** **5-minute cadence** (Worker). The Worker Hub is the active state-holder and primary data source for the PWA.

---

## II. Architectural Honesty: Obviation Strategics (ADR Section I, III)

Instead of patching existing sync complexity, this implementation **obviates** failure points:

### 1. Unified Mutation Brokering
- **Rule:** The Worker intercepts PWA writes (e.g., player dismissals) via a `POST /execute` proxy.
- **Action:** The Worker updates its internal Hub cache **instantly** (Optimistic Update) before fire-and-forgetting the update to GAS.
- **Outcome:** Eliminates "split-brain" lag where the PWA waits for GAS to re-cache.

### 2. Physical Cache Persistence (Section IV)
- **Rule:** Worker state must survive container restarts to prevent the "5-minute vacuum" after Render updates.
- **Action:** Implement `HubPersistenceService` using an **Atomic Rename Strategy** (`fs.rename` from `.tmp` to `.json`).

### 3. Intelligence Centralization
- **Rule:** Deprecate shared logic modules.
- **Action:** The Worker is the **sole owner** of the matrix transformation logic. GAS dumps raw data rows; the Worker's `PayloadKernel` generates the application state.

---

## III. Operational Security & Reliability (ADR Section IV, VII)

### 1. The Circuit Breaker (Zero-Downtime Cut-over)
- **Shadow Mode:** Phase 1-2 runs in the background. PWA fetches data from the Hub but defaults to GAS if the Hub is unhealthy.
- **3s Deadline Fallback:** The PWA `GasClient` will feature a hard 3-second timeout for the Hub. If the deadline is exceeded, it **silently reverts** to GAS.
- **Feature Flag:** `VITE_USE_WORKER_HUB` global kill-switch in PWA.

### 2. Quota & Token Guarding
- **Zero-Trust Token Boundary:** All communication (PWA -> Worker, Worker -> GAS) must validate Bearer tokens.
- **Quota Guard:** Mandatory `Network.quotaCheck()` in the 5m Hub synchronization loop.

---

## IV. Structural Unitary Blueprint (Section VII Naming)

### Layer 1: Core Engine (`@kernel` - Worker)
- **`PayloadKernel.ts` (L1):** Pure matrix transformation engine.
- **`HubPersistenceService.ts` (L1):** Async file system persistence.
- **`DataSchemas.ts` (L1):** Valibot schemas for **Validation Boundary** (ingress/egress).
- **`HubTypes.ts` (L1):** Typed error/state shapes. Every error must be `{ code, message, layer: 'WORKER_HUB' }`.

### Layer 5: Control Surface (`@root`)
- **`API_Raw.gs` (GAS - L5):** Minimalist API to dump sheet rows as JSON.
- **`WorkerHubController.ts` (Worker - L5):** Entry point for PWA Reads/Writes.

---

## V. Execution Phases (Actionable Path)

### Phase 0: System Hardening
- [ ] Define `HubError` and `HubState` types in `HubTypes.ts`.
- [ ] Implement `Network.quotaCheck()` logic in the Worker loop.

### Phase 1: Storage & Intelligence Foundation
- [ ] **`API_Raw.gs` (GAS):** Create minimalist entry point (Bearer token check mandatory).
- [ ] **`PayloadKernel.ts` (Worker):** Port matrix logic (100% Vitest coverage required).
- [ ] **`HubPersistenceService.ts` (Worker):** Implement atomic `fs.rename` strategy.

### Phase 2: Integration & Unified Brokering
- [ ] **Sync Daemon:** Implement 5m loop with **Overlap Protection** (semaphore).
- [ ] **Mutation Proxy:** Implement `POST /execute` route with **Optimistic Cache Updates**.
- [ ] **Symmetry Audit:** Background task compares Worker vs GAS output to ensure 1:1 parity.

### Phase 3: PWA & Scheduling Cut-over
- [ ] **Unified Client:** Point `GasClient.ts` to the Worker Hub.
- [ ] **Cleaning:** Purge legacy PWA retry logic (Obviated by Worker performance).
- [ ] **Trigger Calibration:** Adjust GAS archival frequency to 30 minutes.

---

## VI. Verification Protocol
- **Cold Boot Recovery:** Delete memory state, restart Hub, confirm hydration from `hub_state.json`.
- **Mutation Immediacy:** Confirm cache update < 100ms before GAS write completes.
- **Safety Fallback:** Verify 3s timeout silent fallback to GAS in the PWA.

---

## VII. Governance Checklist (Pre-Commit)
- [ ] **SPDX Headers:** Mandatory GPL-3.0-only license header at line 1.
- [ ] **Naming Contract:** `Domain_Role` (GAS) vs `[Domain][Role].ts` (Worker).
- [ ] **Validation Boundary:** All ingress/egress requires `v.parse()` check.
- [ ] **Isolation:** Zero business logic in entry points; delegate to Kernel/Service.
