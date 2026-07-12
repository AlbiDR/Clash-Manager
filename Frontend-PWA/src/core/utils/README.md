// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# Utility Kernels (@core/utils)

A collection of pure, stateless logic engines and formatting primitives that form the mathematical and structural substrate of the application.

---

## Purpose
Utility Kernels (Layer 1) provide the foundational logic required for data transformation, geometric calculation, and domain-specific normalization. These modules are designed to be "Pure" : they should not maintain internal state or depend on external services.

## Architectural Context
- **Layer**: Layer 1 (@core/utils)
- **Role**: Pure Logic Substrate.
- **Import Boundaries**:
 - **Allowed**: Can import from other Layer 1 utilities or Layer 0 substrate.
 - **Forbidden**: Strictly forbidden from importing from any higher layer (Shared, Features, App) or Core Services.

## Core Utilities

### Domain Logic (`game.ts`, `gameConstants.ts`, `gameTypes.ts` & `economy.ts`)
The authoritative source of truth for Clash Royale game constants and logic.
- **Economy Tables**: Gold costs, XP gains, and material requirements for card upgrades.
- **Branded Currencies**: Implements `Gold`, `Gems`, and `XP` branded types to enforce compile-time currency isolation.
- **Normalization**: Logic for converting relative card levels to absolute game levels.
- **XP Calculation**: Centralized math utilities for calculating relative XP into a level (`calculateXpIntoLevel`) and total cumulative XP (`calculateTotalXp`).
- **Upgrade Resolution**: SSOT for card upgrade data and material requirements, utilized by the Laboratory simulation engine to ensure domain synchronization.
- **King Level Projection**: Tables and algorithms for calculating account level based on cumulative XP.
- **Decomposition**: Domain logic is decomposed into `gameConstants.ts` (static tables) and `gameTypes.ts` (domain interfaces) to satisfy the Single Responsibility Principle.

### Persistence Primitives (`idbKernel.ts`)
Low-level IndexedDB boilerplate and resilience logic.
- **IDB Primitives**: Standardized wrappers for `openDB` and the `idbCore` operations (`get`, `set`, `del`, `clear`).
- **Memory Fallback**: Orchestrates the transparent switch to in-memory storage if IndexedDB is blocked or unavailable.

### Numerical Engines (`math.ts`)
Standardized sanitization, formatting, and calculation logic.
- **math.ts**: Authoritative SSOT for **standardized numeric formatting** (`formatNumber`), supporting locale-aware separators and custom options. Handles `null | undefined | NaN` cases (defaulting to '0') and utilizes a cached formatter for standard cases to reduce instantiation overhead. Handles basic numeric sanitization, trend momentum calculations (`calculateMomentum`), and time-unit conversion (`durationToSeconds`).

### Formatting Kernels (`time.ts`, `text.ts` & `locale.ts`)
Stateless transformation logic for UI display and locale resolution.
- **text.ts**: Centralized **tag normalization** (`cleanTag` & `normalizeTag`) and **visual standardization** (`formatDisplayTag`) for player and clan tags. Implements a custom Markdown-like parsing pipeline for converting remote header descriptions into semantic HTML (supporting titles, bold text, and bulleted lists).
- **time.ts**: Standardized relative-time/countdown formatting and recency parsing (`parseTimeAgoValue`).
- **locale.ts**: Maps the browser's navigator language to Supercell-supported locale codes for building locale-aware external URLs.

### Sort Kernels (`sortOptions.ts` & `sortStrategies.ts`)
Centralized logic for data orchestration in the Roster and Headhunter features.
- **sortStrategies.ts**: Defines pure comparator functions and hybrid sorting logic (e.g., Score -> Raw Score tie-breaking).
- **sortOptions.ts**: Provides authoritative UI sort labels and descriptions, supporting both short summaries and detailed overlay context.

### Geometric Substrate (`bezier.ts`)
Mathematical foundations for data visualization.
- **Cubic Bezier**: Calculations for smooth trend lines and SVG path generation.

### Performance Collections (`PriorityQueue.ts`)
High-performance data structures for simulation optimization.
- **Binary Heap**: Implements an $O(\log N)$ priority queue for efficient upgrade selection in the Laboratory simulation engine.

### Operational Primitives (`navigation.ts`, `visibility.ts` & `mockData.ts`)
Structural and lifecycle logic for application state.
- **Navigation SSOT**: The authoritative source for application-level navigation items and icons.
- **Visibility Registry**: Orchestrates time-based revalidation triggers when the application regains focus.
- **mockData.ts**: Provides high-fidelity synthetic payloads for the Synthetic Data engine, ensuring UI stability during demonstration and testing.

---

## Integration Standards
- **Purity Axiom**: Utilities MUST remain stateless. Any function that requires reactive state or side effects should be implemented as a Composable in the Service or Shared layer instead.
- **Zero-Dependency Boundary**: Utilities should avoid importing from higher-level kernels (like `StorageService` or `useClashDataStore`) to prevent circular dependencies.
- **Direct Consumption**: To ensure optimal tree-shaking, utilities should be imported directly from their specific file rather than a barrel export where possible.
