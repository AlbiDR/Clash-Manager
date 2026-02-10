# 🏗️ Clinical Architecture: The "Clean Stack" Protocol

This document serves as the **Single Source of Truth** for the `Clash-Manager` architecture. It strictly defines the structural, nomenclatural, and behavioral standards required to maintain a 100/100 Lighthouse-grade codebase.

---

## 1. The Four Layers of "Antigravity"

We employ a **Strict Unitary Architecture**. Code must live exactly where it belongs.

### 🔴 Layer 1: Core (`@core`)
**Definition**: The "Kernel". Code that is biologically necessary for the application to boot, but **agnostic** to the business domain.
- **Rule**: Pure TypeScript only. No Vue components (mostly). No business logic.
- **Contents**:
  - `api/`: abstract HTTP clients (`GasClient`).
  - `theme/`: Design tokens, CSS variables, typography.
  - `types/`: Brand types (`Flavor<T>`) and global interfaces.
  - `utils/`: Mathematical and string manipulation primitives.

### 🟡 Layer 2: Shared (`@shared`)
**Definition**: The "Building Blocks". Reusable molecules that have no specific business allegiance.
- **Rule**: Must be generic enough to drop into *any* other project.
- **Contents**:
  - `ui/`: Dumb components (`Icon`, `Button`, `Card`, `Skeleton`). **Zero state.**
  - `composables/`: Device/Browser logic (`useHaptics`, `useWakeLock`, `useStorage`).

### 🟢 Layer 3: Features (`@features`)
**Definition**: The "Business". Self-contained silos of domain logic.
- **Rule**: A Feature **NEVER** imports from another Feature. Communication happens via URL parameters or Global State (Store).
- **Structure (Fractal)**:
  - `my-feature/`
    - `components/`: Domain-specific UI (`UpgradeCard.vue`).
    - `composables/`: Domain-specific State (`useLaboratory.ts`).
    - `logic/`: Pure Business Logic / Algorithms (`Optimizer.ts`).
    - `types/`: Feature-local types.
    - `views/`: The Entry Point (Route) for this feature.
    - `index.ts`: **The Public API**. (See "Barrel Protocol" below).

### 🔵 Layer 4: App (`@app`)
**Definition**: The "Glue". Context-aware orchestration.
- **Rule**: The only layer allowed to import from `@features`.
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

---

## 3. The "Barrel Protocol" (Public API)

To prevent "Graph Spaghetti," every module must define a clear boundary.

- **Rule**: Features must export their public interface via an `index.ts`.
- **Consumer Rule**: Imports from a feature should (ideally) target the feature root, not deep files, UNLESS it causes circular dependency or tree-shaking bloat.
- **Standard**:
  ```typescript
  // ✅ Correct
  import { LaboratoryView } from '@features/laboratory';
  
  // ⚠️ Avoid (Deep Linking) unless necessary for optimization
  import LaboratoryView from '@features/laboratory/views/LaboratoryView.vue';
  ```

---

## 4. Testing "Co-Location" Strategy

Tests shall no longer live in a distant `tests/` folder. They must live **alongside** the unit they test, ensuring high visibility and atomic refactoring.

- **Pattern**: `__tests__` directory inside the unit's parent.
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

### Phase 5: Routing & Cleanup
- [ ] Reconfigure router to point to new Feature Views.
- [ ] Delete legacy folders.
- [ ] Run **full** test suite and fix all 400+ likely broken imports.
