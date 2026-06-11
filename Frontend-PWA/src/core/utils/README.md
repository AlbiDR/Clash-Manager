// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# Utility Kernels (@core/utils)

A collection of pure, stateless logic engines and formatting primitives that form the mathematical and structural substrate of the application.

---

## Purpose
Utility Kernels (Layer 1) provide the foundational logic required for data transformation, geometric calculation, and domain-specific normalization. These modules are designed to be "Pure" -- they should not maintain internal state or depend on external services.

## Architectural Context
- **Layer**: Layer 1 (@core/utils)
- **Role**: Pure Logic Substrate.
- **Import Boundaries**:
  - **Allowed**: Can import from other Layer 1 utilities or Layer 0 substrate.
  - **Forbidden**: Strictly forbidden from importing from any higher layer (Shared, Features, App) or Core Services.

## Core Utilities

### Domain Logic (`game.ts`)
The authoritative source of truth for Clash Royale game constants and logic.
- **Economy Tables**: Gold costs, XP gains, and material requirements for card upgrades.
- **Normalization**: Logic for converting relative card levels to absolute game levels.
- **King Level Projection**: Tables and algorithms for calculating account level based on cumulative XP.

### Persistence Primitives (`idbKernel.ts`)
Low-level IndexedDB boilerplate and resilience logic.
- **IDB Primitives**: Standardized wrappers for `openDB`, `getValue`, and `setValue`.
- **Memory Fallback**: Orchestrates the transparent switch to in-memory storage if IndexedDB is blocked or unavailable.

### Numerical Engines (`math.ts` & `predictionMath.ts`)
Standardized sanitization and projection logic.
- **math.ts**: Basic numeric sanitization and trend momentum calculations.
- **predictionMath.ts**: Weighted-average engines for historical performance projection and crown forecasting.

### Formatting Kernels (`time.ts` & `text.ts`)
Stateless transformation logic for UI display.
- **time.ts**: Standardized date/time formatting and duration-to-seconds conversion.
- **text.ts**: HTML normalization and text sanitization.

### Geometric Substrate (`bezier.ts`)
Mathematical foundations for data visualization.
- **Cubic Bezier**: Calculations for smooth trend lines and SVG path generation.

---

## Integration Standards
- **Purity Axiom**: Utilities MUST remain stateless. Any function that requires reactive state or side effects should be implemented as a Composable in the Service or Shared layer instead.
- **Zero-Dependency Boundary**: Utilities should avoid importing from higher-level kernels (like `StorageService` or `useClashDataStore`) to prevent circular dependencies.
- **Direct Consumption**: To ensure optimal tree-shaking, utilities should be imported directly from their specific file rather than a barrel export where possible.
