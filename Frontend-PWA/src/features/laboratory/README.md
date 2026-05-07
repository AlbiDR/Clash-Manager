# Laboratory -- Progression Engine

The **Strategic Simulator**. A self-contained Feature (Layer 3) responsible for modeling player progression paths and optimizing card upgrades based on ROI or specific level targets.

---

## Purpose
The Laboratory allows users to project their future King Level and resource consumption by simulating optimal upgrade sequences. It handles the complexity of XP gain, gold costs, and wild card usage across all rarities.

## Architectural Context
- **Layer**: Layer 3 (@features)
- **Isolation**: Strictly decoupled. Never imports from other Features (Headhunter, Roster, Settings).
- **Dependencies**:
  - `@core/utils/economy`: Branded currency arithmetic.
  - `@core/utils/PriorityQueue`: O(log N) candidate selection.
  - `@core/api/SupabaseClient`: Profile fetching and authoritative feature view access.

## Logic Subsystems

### Validation Boundary (ProfileHydrator.ts)
The Laboratory implements a strict validation boundary. Raw data from the Supabase backend (fetched via authoritative feature views) or external RoyaleAPI payloads is passed through `ProfileInputSchema` (Valibot) before being transformed into domain-specific types.

### Progression Engine (Simulation.ts)
A non-blocking, generator-based engine that calculates the most efficient upgrade path.
- **Generator Pattern**: Processes upgrades in 10ms chunks to maintain 60FPS UI responsiveness via `requestIdleCallback`.
- **Recursive Chain Lookahead**: Evaluates the "character arc" of a card (determined by `LOOKAHEAD_PRECISION` and `LOOKAHEAD_WEIGHT`) to avoid greedy traps and local optima.
- **Priority Queue**: Uses a Binary Heap (O(log N) selection) to always select the highest-efficiency candidate.

### Trajectory Rendering (TrajectoryList.vue)
Renders the recommended upgrade path using a high-performance rendering strategy.
- **Progressive Rendering**: Utilizes `useProgressiveList` (@core/services) to time-slice the injection of trajectory items into the DOM. This maintains 60FPS even when a simulation results in hundreds of recommended actions, replacing the legacy "Show More" manual expansion with automated background hydration.

### Strategy Pattern (ScoringStrategy.ts)
Upgrade priorities are defined by interchangeable strategies:
- **Level Projection (`ProjectionStrategy`)**: Aggressively prioritizes Card Level milestones (15, 16) to maximize XP gain. Selecting this strategy automatically enables **Infinite Resources** mode to find the fastest theoretical path to King Level milestones.
- **Resource Efficiency (`InventoryStrategy`)**: Strictly optimizes for XP ROI (Experience per Gold). This strategy is designed for realistic progression based on current gold and card inventory, penalizing gem spending by a factor of 50x.

### Constants Registry (Registry.ts)
Centralized source of truth for game-specific data:
- `GOLD_COST_TABLE`: Gold required per level.
- `CARD_XP_TABLE`: XP gained per level.
- `MATERIAL_REQUIREMENTS`: Cards/Wild Cards required per rarity and level.

## State Management
Managed via the `useLaboratoryStore` Pinia store. Following Section III of the ADR, feature-specific state (observations, simulation results, and settings) is private to the silo and managed via centralized state.

### Persistence & Hydration
- **LocalStorage**: Settings (`laboratory-settings`) and Simulation Results (`laboratory-observation`) are persisted to ensure session resilience.
- **Migration Logic**: The store includes a migration layer to normalize legacy strategy names ('Target' -> 'Level Projection', 'Maximize' -> 'Resource Efficiency').

### Performance & Memoization
- **Stability Support**: Implements `getTrajectoryMemoKeys` to provide stable dependency arrays for Vue's `v-memo` directive. This ensures that trajectory items only re-render when critical metrics (Efficiency Index, Upgrade Type) actually change, maintaining 60FPS during active simulations.

### Behavioral Orchestration (useLaboratory.ts)
The `useLaboratory` composable serves as the behavioral orchestrator, standardizing communication between the simulation logic and the UI.
- **Layout Orchestration**: Provides standardized `layoutProps` and `layoutEvents` for direct binding to `ConsoleLayout`, centralizing status resolution (e.g., "Engine Operational", "Computing Trajectory") and refresh logic.
- **Simulation Lifecycle**: Manages the non-blocking execution of the progression engine and cancellation of stale runs.
- **Data Ingestion**: Handles the hydration of raw profiles and merging of persisted inventory overrides.
- **Performance Optimization**: Centralizes the `getTrajectoryMemoKeys` logic to ensure stable rendering performance across the trajectory list.
