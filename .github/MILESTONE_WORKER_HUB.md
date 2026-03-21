// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# Milestone: Worker-Led Data Hub Transition (Architectural Honesty)

This document is the **Single Source of Truth** for the transition to a **Worker-Led Data Hub**. It integrates architectural principles, technical risk assessments, and the phase-by-phase implementation plan.

---

## I. Mission Statement
The objective is to pivot the primary data synchronization pipeline from a GAS-driven model to a **Render Worker-driven Hub**. This fulfills the **Deep Delegation Strategy** (ADR Section IV) by offloading heavy computational lifting (aggregation and compression) to the Render Worker while relegating GAS to a "Dumb Raw Storage" role.

- **Current Model:** 60-minute cadence; PWA reads from GAS/Sheets.
- **Proposed Model:** 5-minute cadence; PWA reads from the Worker Hub (Active State).

---

## II. Architectural Assessment (Honesty vs. Patching)

### 1. Risk Obviation Strategy
Instead of patching complexity (e.g., sharing logic modules), we **obviate** it by centralizing intelligence:
- **Shared Logic:** Deprecated. The **Worker is the sole owner** of transformation logic. GAS exports raw data; the Worker generates the matrix.
- **Split-Brain Sync:** Resolved via **Unified Brokering**. The Worker intercepts PWA writes, updates its cache instantly, and fire-and-forgets to GAS.
- **State Vacuum:** Obviated by **Local Persistence**. The Worker persists its latest state to a local JSON file to survive container restarts.

### 2. Gains & Regressions
- **Performance:** PWA cold starts drop from ~3s to **< 500ms**.
- **Scalability:** Near-infinite read throughput by bypassing Google's 20,000 requests/day quota.
- **Regression:** The Google Sheet becomes "Eventual Persistence" (Archive) rather than "Real-Time Truth."

---

## III. Structural Unitary Alignment (ADR)

### Layer 1: Core Engine (`@kernel` - Worker Only)
- **`PayloadCompressor.ts`:** The sole engine for matrix generation.
- **`HubPersistenceService.ts`:** Handles state-saving to disk for instant hydration.
- **`DataSchemas.ts`:** Valibot schemas governing the stack's validation boundary.

### Layer 2 & 5: Persistence & Control
- **`RawDataFeed.gs` (GAS - L2):** A minimalist API that exports spreadsheet rows as raw JSON.
- **`WorkerHubController.ts` (Worker - L5):** The primary entry point for all PWA traffic (Proxy for Reads/Writes).

---

## IV. Implementation Blueprint (The Honest Path)

### Phase 1: Storage & Intelligence Foundation
- [ ] **1.1: GAS Raw API:** Create `API_Raw.ts` in GAS to dump sheet rows as untransformed JSON.
- [ ] **1.2: Payload Compressor:** Port the matrix logic to the Worker and harden for Node.js.
- [ ] **1.3: Persistence Engine:** Implement `fs`-based file saving for background state persistence.
- [ ] **1.4: Unit Testing:** 100% Vitest coverage for `PayloadCompressor.ts` (Layer 1 requirement).

### Phase 2: Hub Integration & Brokering
- [ ] **2.1: The Sync Daemon:** Implement a 5m `setInterval` loop in the Worker to fetch from Royale API + GAS Raw Feed.
- [ ] **2.2: Mutation Proxy:** Implement the `POST /execute` route in the Worker to forward writes to GAS.
- [ ] **2.3: Validation Boundary:** Wrap all Hub updates in a `validatePayload()` check.

### Phase 3: PWA & Scheduling Cut-over
- [ ] **3.1: Unified Client:** Point `GasClient.ts` to the Worker for all operations.
- [ ] **3.2: Cleaning Logic:** Remove legacy PWA caching and retry code that compensated for GAS's high latency.
- [ ] **3.3: Trigger Calibration:** Shift GAS archival triggers to a **30-minute cadence**.

---

## V. Verification & Stability Protocol
- **Cold Boot Test:** Verify the PWA loads instantly from the Worker's local JSON cache upon restart.
- **Mutation Immediacy:** Confirm PWA writes are reflected in the Hub state in < 100ms.
- **Symmetry Audit:** Ensure Worker Matrix output matches the legacy GAS output 1:1.
