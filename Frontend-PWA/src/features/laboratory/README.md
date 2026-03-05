# Laboratory — Progression Engine

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
  - `@core/api/GasClient`: Profile fetching.

## Logic Subsystems

### Validation Boundary (ProfileHydrator.ts)
The Laboratory implements a strict validation boundary. Raw data from the Google Apps Script backend or external RoyaleAPI payloads is passed through `ProfileInputSchema` (Valibot) before being transformed into domain-specific types.

### Progression Engine (Simulation.ts)
A non-blocking, generator-based engine that calculates the most efficient upgrade path.
- **Generator Pattern**: Processes upgrades in 10ms chunks to maintain 60FPS UI responsiveness.
- **Recursive Lookahead**: Evaluates the "character arc" of a card (up to 5 steps deep) to avoid greedy traps and local optima.
- **Priority Queue**: Uses a Binary Heap to always select the highest-efficiency candidate.

### Strategy Pattern (ScoringStrategy.ts)
Upgrade priorities are defined by interchangeable strategies:
- **Level Projection**: Aggressively prioritizes King Level milestones (15, 16), assuming resources will eventually be acquired.
- **Resource Efficiency**: Strictly optimizes for XP ROI (Experience per Gold), penalizing gem spending.

### Constants Registry (Registry.ts)
Centralized source of truth for game-specific data:
- `GOLD_COST_TABLE`: Gold required per level.
- `CARD_XP_TABLE`: XP gained per level.
- `MATERIAL_REQUIREMENTS`: Cards/Wild Cards required per rarity and level.

## State Management
Managed via the `useLaboratory` singleton composable. It persists user settings, inventory overrides, and simulation results to `LocalStorage` to ensure a consistent experience across sessions.
