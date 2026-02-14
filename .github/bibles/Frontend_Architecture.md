# Clinical Architecture: The "Clean Stack" Protocol

This document serves as the **Single Source of Truth** for the `Clash-Manager` architecture. It strictly defines the structural, nomenclatural, and behavioral standards required to maintain a 100/100 Lighthouse-grade codebase.

---

## 1. The Four Layers of "Antigravity"

We employ a **Strict Unitary Architecture**. Code must live exactly where it belongs.

### Layer 1: Core (@core) [Kernel]
**Definition**: Agnostic infrastructure. Pure logic required to boot and transport data.
- **Rule**: Pure TypeScript only. Agnostic to the specific feature views.
- **Contents**:
  - `api/`: Abstract transport clients.
  - `theme/`: Global styling tokens, shared icons, and base CSS.
  - `services/`: Infrastructure singletons (Loggers, Drivers, Storage).
  - `types/`: Domain-agnostic TypeScript definitions.
  - `utils/`: Algorithmic primitives and math engines.

### Layer 2: Shared (@shared) [Molecules]
**Definition**: Domain-blind UI and logic building blocks.
- **Rule**: Components must be "dumb" (state from props, emit events up).
- **Contents**:
  - `ui/`: Stateless elements (Icon, Button, Card, Skeleton).
  - `composables/`: Reusable browser behaviors (Haptics, WakeLock).
  - `directives/`: Global Vue directives (Tooltip, Tactile).

### Layer 3: Features (@features) [Business]
**Definition**: Self-contained business silos. Fractal structure.
- **Rule**: A Feature **NEVER** imports from another Feature. 
- **Structure**:
  - `laboratory/`: Simulation and resource optimization.
  - `headhunter/`: Recruitment discovery and scanning.
  - `roster/`: Performance tracking and leaderboard.
  - `settings/`: System configuration.

### Layer 4: App (@app) [Glue]
**Definition**: Context-aware orchestration.
- **Rule**: Only App imports from Features.
- **Contents**:
  - `router/`: Navigation and transitions.
  - `layouts/`: The Shell/Container.
  - `sw.ts`: PWA Service Worker logic.
  - `main.ts/App.vue`: Boot sequence.

---

## 2. The "OCD Verification" Checklist

Before completing any task, every developer (and AI) must verify:
1. [ ] **Location**: Does this file live in the correct layer?
2. [ ] **Registry**: Is it exported via the module's `index.ts` (Barrel Protocol)?
3. [ ] **Naming**: Does it follow the strict naming table?
4. [ ] **Deduplication**: Have you eliminated redundant code paths?
5. [ ] **Tests**: Is there a corresponding test in a sibling `__tests__` folder?
6. [ ] **Types**: Are all public interfaces explicitly typed? No any.
7. [ ] **A11y**: Are touch targets and ARIA labels correct?
8. [ ] **Visual Purity**: Absolutely zero emojis present in the code or documentation.

---

## 3. The Registry Strategy (Barrel Protocol)

To prevent "Graph Spaghetti" and ensure clear boundaries, every significant module defines a **Public API** via an `index.ts` file.

- **Standard**:
  ```typescript
  // features/laboratory/index.ts
  export { default as LaboratoryView } from './views/LaboratoryView.vue';
  export { useLaboratory } from './composables/useLaboratory';
  export * from './types';
  ```
- **Consumer Rule**: Always import from the Registry alias.
  ```typescript
  import { LaboratoryView } from '@features/laboratory'; // Correct
  ```
- **Internal Rule**: Internal files within a feature can use relative imports, but external consumers must use the alias.

---

## 4. Naming Conventions (Strict Case)

| Type | Convention | Example |
| :--- | :--- | :--- |
| **Directories** | `kebab-case` | `features/headhunter`, `shared/ui` |
| **Components** | `PascalCase` | `UpgradeCard.vue`, `Icon.vue` |
| **Composables** | `camelCase` (prefixed `use`) | `useLaboratory.ts` |
| **Classes/Singletons** | `PascalCase` | `GasClient.ts`, `StorageService.ts` |
| **Utilities/Funcs** | `camelCase` | `formatCurrency.ts`, `calculateXp.ts` |
| **Types/Interfaces** | `PascalCase` | `PlayerData`, `OptimizationResult` |
| **Tests** | `*.spec.ts` | `useLaboratory.spec.ts` |
| **Registry** | `index.ts` | (The entry point for any structured module) |
