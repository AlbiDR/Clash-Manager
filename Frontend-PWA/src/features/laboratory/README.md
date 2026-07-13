// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# Laboratory : Progression Engine

The **Strategic Simulator**. A self-contained Feature (Layer 3) responsible for modeling player progression paths and optimizing card upgrades based on ROI or specific level targets.

---

## Purpose
The Laboratory allows users to project their future King Level and resource consumption by simulating optimal upgrade sequences. It handles the complexity of XP gain, gold costs, and wild card usage across all rarities.

## Architectural Context
- **Layer**: Layer 3 (@features)
- **Isolation**: Strictly decoupled. Never imports from other Features (Headhunter, Roster, Settings).
- **Dependencies**:
 - `@core/utils/economy`: Branded currency arithmetic.
 - `@core/api/ProfileClient`: Profile fetching.

## Logic Subsystems

### Validation Boundary (ProfileHydrator.ts)
The Laboratory implements a strict validation boundary. Raw data from the Supabase backend or external RoyaleAPI payloads is passed through `ProfileInputSchema` (Valibot) before being transformed into domain-specific types.

### Progression Engine (SimulationEngine.ts)
A non-blocking, generator-based engine that coordinates core logic and scoring strategies to calculate optimal upgrade paths.
- **Generator Pattern**: Processes upgrades in 10ms chunks to maintain 60FPS UI responsiveness.
- **Priority Queue Optimization**: Utilizes the `@core/utils/PriorityQueue` to maintain an $O(\log N)$ selection loop for upgrade candidates.
- **Greedy Optimization**: Identifies and executes the optimal upgrade step based on the active scoring strategy.

### Strategy Pattern (ScoringStrategy.ts)
Upgrade priorities are defined by interchangeable strategies:
- **Level Projection (`ProjectionStrategy`)**: Aggressively prioritizes Card Level milestones (15, 16) to maximize XP gain. Selecting this strategy automatically enables **Infinite Resources** mode to find the fastest theoretical path to King Level milestones.
- **Resource Efficiency (`InventoryStrategy`)**: Strictly optimizes for XP ROI (Experience per Gold). This strategy is designed for realistic progression based on current gold and card inventory, penalizing gem spending by a factor of 50x.

### Simulation Core (SimulationCore.ts)
Atomic evaluation and state transition logic.
- **getUpgradeCandidate**: Evaluates card upgrade viability against resource constraints.
- **applyUpgrade**: Executes immutable state transitions for chosen upgrades.

### Simulation Mappers (SimulationMappers.ts)
- **mapStateToResult**: Transformer that converts internal simulation state to UI-ready DTOs.

### Trajectory Rendering (TrajectoryList.vue)
Renders the recommended upgrade path using a high-performance rendering strategy.
- **Progressive Rendering**: Utilizes `useProgressiveList` (@core/services) to time-slice the injection of trajectory items into the DOM. This maintains 60FPS even when a simulation results in hundreds of recommended actions, replacing the legacy "Show More" manual expansion.

### Logic Subsystems
The feature logic is decomposed into several specialized modules to ensure Layer 3 compliance and maintainability:
- **Upgrade Resolution**: Delegates to the core `getUpgradeData` utility (Layer 1) to resolve costs and gains for specific card rarities and levels, ensuring domain synchronization across features.

## State Management
Managed via the `useLaboratoryStore` Pinia store. Following Section III of the ADR, feature-specific state (observations, simulation results, and settings) is private to the silo and managed via centralized state.

### Persistence & Hydration
- **LocalStorage**: Settings (`laboratory_settings`) and the player Observation (`laboratory_observation`, the hydrated `PlayerData` input - not the computed result) are persisted to ensure session resilience. Inventory overrides use `laboratory_inventory`.
- **Migration Logic**: The store includes a migration layer to normalize legacy strategy names ('Target' -> 'Level Projection', 'Maximize' -> 'Resource Efficiency').

### Performance & Memoization
- **Stability Support**: Implements `getTrajectoryMemoKeys` to provide stable dependency arrays for Vue's `v-memo` directive. This ensures that trajectory items only re-render when critical metrics (Efficiency Index, Upgrade Type) actually change, maintaining 60FPS during active simulations.

### Behavioral Orchestration (useLaboratory.ts & useLaboratorySimulation.ts)
The behavioral layer standardizes communication between the simulation logic and the UI.
- **useLaboratory.ts**: Orchestrates high-level layout state and data ingestion.
 - **Layout Orchestration**: Provides standardized `layoutProps` and `layoutEvents` for direct binding to `ConsoleLayout`, centralizing status resolution and refresh logic.
 - **Data Ingestion**: Handles the hydration of raw profiles and merging of persisted inventory overrides.
 - **Memoization**: Exposes `getTrajectoryMemoKeys` for stable `v-memo` dependency arrays across the trajectory list.
- **useLaboratorySimulation.ts**: Specialized orchestrator for simulation execution.
 - **Simulation Lifecycle**: Manages the non-blocking execution of the progression engine, cancellation of stale runs (via `currentSimulationId`), and batched generator consumption within ~10ms `requestIdleCallback` budgets.
