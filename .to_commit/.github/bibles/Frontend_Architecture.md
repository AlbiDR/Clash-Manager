# 🏗️ Clinical Architecture: The "Clean Stack" Protocol

This document serves as the **Single Source of Truth** for the `Clash-Manager` architecture. It strictly defines the structural, nomenclatural, and behavioral standards required to maintain a 100/100 Lighthouse-grade codebase.

> **Rationale**: This rigorous structure is not about bureaucracy; it is about **Scalable Precision**. By strictly defining where every atom belongs, we eliminate cognitive load during development. A developer should never have to ask "Where do I put this?"—the architecture provides the only possible answer.

---

## 1. The Four Layers of "Antigravity"

We employ a **Strict Unitary Architecture**. Code must live exactly where it belongs.

### 🔴 Layer 1: Core (`@core`)
**Definition**: The "Kernel". Code that is biologically necessary for the application to boot, but **agnostic** to the business domain.
- **Rule**: Pure TypeScript only. No Vue components (mostly). No business logic.
- **Why**: Changes here are rare but devastating. Keeping this small and pure ensures stability.
- **Contents**:
  - `api/`: abstract HTTP clients (`GasClient`).
  - `theme/`: Design tokens, CSS variables, typography.
  - `types/`: Brand types (`Flavor<T>`) and global interfaces.
  - `utils/`: Mathematical and string manipulation primitives.

### 🟡 Layer 2: Shared (`@shared`)
**Definition**: The "Building Blocks". Reusable molecules that have no specific business allegiance.
- **Rule**: Must be generic enough to drop into *any* other project.
- **Why**: Prevents "DRY Violations" by centralizing common UI/Logic patterns.
- **Contents**:
  - `ui/`: Dumb components (`Icon`, `Button`, `Card`, `Skeleton`). **Zero state.**
  - `composables/`: Device/Browser logic (`useHaptics`, `useWakeLock`, `useStorage`).

### 🟢 Layer 3: Features (`@features`)
**Definition**: The "Business". Self-contained silos of domain logic.
- **Rule**: A Feature **NEVER** imports from another Feature. Communication happens via URL parameters or Global State (Store).
- **Why**: Encapsulates complexity. You can delete the `headhunter` folder, and the rest of the app compiles perfectly.
- **Structure (Fractal)**:
  - `my-feature/`
    - `components/`: Domain-specific UI (`UpgradeCard.vue`).
    - `composables/`: Domain-specific State (`useLaboratory.ts`).
    - `logic/`: Pure Business Logic / Algorithms (`Optimizer.ts`).
    - `types/`: Feature-local types.
    - `views/`: The Entry Point (Route) for this feature.
    - `index.ts`: **The Public API** (See Barrel Protocol).

### 🔵 Layer 4: App (`@app`)
**Definition**: The "Glue". Context-aware orchestration.
- **Rule**: The only layer allowed to import from `@features`.
- **Why**: Someone needs to know the big picture. This layer maps URLs to Features.
- **Contents**:
  - `router/`: Definitions of routes.
  - `layouts/`: `ConsoleLayout.vue` (The shell).
  - `main.ts`: The boot sequence.

---

## 2. Naming Conventions (Strict Case)

| Type | Convention | Example |
| :--- | :--- | :--- |
| **Directories** | `kebab-case` | `features/headhunter`, `shared/ui` |
| **Components** | `PascalCase` | `UpgradeCard.vue`, `Icon.vue` |
| **Composables** | `camelCase` (prefixed `use`) | `useLaboratory.ts` |
| **Classes/Singletons** | `PascalCase` | `GasClient.ts`, `Optimizer.ts` |
| **Utilities/Funcs** | `camelCase` | `formatCurrency.ts`, `calculateXp.ts` |
| **Types/Interfaces** | `PascalCase` | `PlayerData`, `OptimizationResult` |
| **Tests** | `*.spec.ts` or `*.test.ts` | `useLaboratory.spec.ts` |
| **Registry** | `index.ts` | (The entry point for any structured module) |

---

## 3. The "Barrel Protocol" (Registry Strategy)

To prevent "Graph Spaghetti" and ensure clear boundaries, every significant module defines a **Public API** via an `index.ts` file.

- **Role**: The `index.ts` determines what is private (internal details) and what is public (usable by the App).
- **Standard**:
  ```typescript
  // features/laboratory/index.ts
  
  // ✅ EXPORT only the Public API
  export { default as LaboratoryView } from './views/LaboratoryView.vue';
  export { default as LaboratoryKernel } from './logic/Laboratory_Kernel';
  export * from './types';
  
  // ⛔ DO NOT EXPORT internal sub-components
  // export { default as InternalUpgradeButton } from './components/InternalUpgradeButton.vue';
  ```
- **Consumer Rule**: Always import from the Registry.
  ```typescript
  // ✅ Correct
  import { LaboratoryView } from '@features/laboratory';
  
  // ⛔ Wrong (Breaks Encapsulation)
  import LaboratoryView from '@features/laboratory/views/LaboratoryView.vue';
  ```

---

## 4. Testing "Co-Location" Strategy

Tests shall no longer live in a distant `tests/` folder. They must live **alongside** the unit they test, ensuring high visibility and atomic refactoring.

- **Rule**: Every `logic` or `composable` directory MUST have a `__tests__` sibling.
- **Rogue Tests**: The legacy `Frontend-PWA/tests/` folder is **DEPRECATED**. All tests inside must be moved to their respective feature or core folders.
- **Example**:
  ```text
  src/features/laboratory/logic/
  ├── Optimizer.ts
  └── __tests__/
      └── Optimizer.spec.ts
  ```

---

## 5. Asset Management

- **Global Assets**: `public/` (Favicons, manifest, truly static global files).
- **Feature Assets**: If a feature has specific SVGs or static JSONs, they belong in `src/features/xxx/assets/`.

---

## 6. Migration Checklist (Enhanced)

### Phase 1: Infrastructure (Done)
- [x] Create directory skeleton.
- [x] Configure aliases in `tsconfig` & `vite`.

### Phase 2: The Core Extraction (Safe)
- [ ] Move `utils` -> `@core/utils`. (Verify imports)
- [ ] Move `types` -> `@core/types`.
- [ ] Move `api` -> `@core/api`.

### Phase 3: The Component Atomic Split (Tedious)
- [ ] Identify "Atoms" in `components/`.
- [ ] Move Atoms -> `@shared/ui`.
- [ ] Move `composables/use*` (generic) -> `@shared/composables`.
- [ ] Update imports in the remaining monolithic `components/`.

### Phase 4: Feature Encapsulation (High Risk)
- [ ] **Laboratory**: Gather `logic/Laboratory`, `components/Laboratory`, `useLaboratory` -> `@features/laboratory`.
- [ ] **Headhunter**: Gather `useHeadhunter`, `RecruiterView`, related components -> `@features/headhunter`.
- [ ] **Settings**: Gather `SettingsView`, `useSettings` -> `@features/settings`.

### Phase 5: Cleanup & Registry Enforcement
- [ ] Create `index.ts` registries for all features.
- [ ] Move rogue `Frontend-PWA/tests/` to feature scopes.
- [ ] Reconfigure router to point to new Feature Views.
- [ ] Run **full** test suite and fix imports.
