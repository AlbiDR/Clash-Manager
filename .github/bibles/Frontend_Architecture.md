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
  - `services/`: Wrappers for foundational 3rd-party libs (e.g., Validation, Storage).

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
    - `components/`: Domain-specific UI components.
    - `composables/`: Feature-local state (Stores) and lifecycle logic.
    - `logic/`: Pure Business Logic / Algorithms / Parsers.
    - `types/`: Feature-local TypeScript definitions.
    - `views/`: The Entry Point (Route) for this feature.
    - `index.ts`: **The Public API** (See Barrel Protocol).

### 🔵 Layer 4: App (`@app`)
**Definition**: The "Glue". Context-aware orchestration.
- **Rule**: The only layer allowed to import from `@features`.
- **Why**: Someone needs to know the big picture. This layer maps URLs to Features.
- **Contents**:
  - `router/`: Definitions of routes.
  - `layouts/`: `ConsoleLayout.vue` (The shell).
  - `store/`: Orchestration state that spans multiple features.
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
| **Tests** | `*.spec.ts` | `useLaboratory.spec.ts` |
| **Registry** | `index.ts` | (The entry point for any structured module) |

---

## 3. The "Registry Strategy" (Barrel Protocol)

To prevent "Graph Spaghetti" and ensure clear boundaries, every significant module defines a **Public API** via an `index.ts` file.

- **Role**: The `index.ts` determines what is private (internal details) and what is public (usable by the App).
- **Standard**:
  ```typescript
  // features/laboratory/index.ts
  
  // ✅ EXPORT only the Public API
  export { default as LaboratoryView } from './views/LaboratoryView.vue';
  export { default as LaboratoryKernel } from './logic/Laboratory_Kernel';
  export * from './types';
  
  // ⛔ DO NOT EXPORT internal sub-components or private logic
  ```
- **Consumer Rule**: Always import from the Registry alias.
  ```typescript
  // ✅ Correct
  import { LaboratoryView } from '@features/laboratory';
  
  // ⛔ Wrong (Breaks Encapsulation)
  import LaboratoryView from '@features/laboratory/views/LaboratoryView.vue';
  ```

---

## 4. State Management & Data Flow

### Composable as Store
- Feature state should live in a **singleton composable** within the feature's `composables/` folder.
- **Unidirectional Flow**: Views pass data down to components via props; components communicate up via emits.
- **Logic Isolation**: Data fetching and heavy parsing should live in `logic/`, called by the `composable` to update the state.

### Dependency Wrapping
- **Rule**: foundational 3rd-party libraries (Validation, Storage, API clients) MUST be wrapped in `@core/services`.
- **Benefit**: If we switch from `valibot` to `zod`, we change **one** file in `@core`, not fifty files in `@features`.

---

## 5. Testing & Quality Assurance

### Co-Location
- Tests must live in a `__tests__` directory sibling to the file they are testing.
- Legacy `Frontend-PWA/tests/` folder is **strictly forbidden**.

### Error Resilience
- **Mandatory Boundary**: All Feature Views must be wrapped in a shared `<ErrorBoundary>` component.
- **Async Pattern**: Every async component must provide a `<template #fallback>` with a corresponding Skeleton component from `@shared/ui`.

---

## 6. Accessibility & Responsiveness

- **Semantic HTML**: Mandatory use of `<nav>`, `<main>`, `<article>`, and `<section>`. No "Div Soup."
- **ARIA**: Interactive elements without native labels must have `aria-label`.
- **Contrast**: Maintain AA/AAA standard colors at all times.
- **Touch Targets**: Minimum 44x44px for all mobile interactive elements.

---

## 7. Documentation & Comments

- **Rationale over Implementation**: Comments should explain *why* something is done (the business reason), not *how* (the code should be self-documenting).
- **JSDoc**: All `@core` utilities and `@features` logic must have JSDoc for complex functions.

---

## 8. The "OCD Verification" Checklist
Before completing any task, every developer (and AI) must verify:
1. [ ] **Location**: Does this file live in the correct layer?
2. [ ] **Registry**: Is it exported via the module's `index.ts`?
3. [ ] **Naming**: Does it follow the strict naming table?
4. [ ] **Wrappers**: Are we using `@core` services instead of direct 3rd party imports?
5. [ ] **Tests**: Is there a corresponding `.spec.ts` in a `__tests__` folder?
6. [ ] **Types**: Are all public interfaces explicitly typed? No `any`.
7. [ ] **A11y**: Are touch targets and ARIA labels correct?

---

## 9. Migration Roadmap

### 🏁 Phase 0: Stability Anchorage
Before moving a single byte, ensure the foundation is locked.
- [ ] **Test Lock**: Run `pnpm test` and ensure 100% pass rate.
- [ ] **Type Check**: Run `vue-tsc --noEmit` and ensure 0 errors.
- [ ] **Sync**: Ensure branch `Restructure` is fully synced with any upstream logic patches.

### 🧱 Phase 1: Infrastructure (Completed) ✅
- [x] Create directory skeleton.
- [x] Configure `@core`, `@shared`, `@features`, `@app` aliases in `tsconfig` and `vite.config`.

### 🔴 Phase 2: Core Extraction (Low Risk)
Objective: Decouple foundational tools from the view layer.
- [ ] **Utils Partition**:
    - `src/utils/formatters.ts` -> `@core/utils/formatters.ts`
    - `src/utils/warMath.test.ts` -> `@core/utils/__tests__/warMath.spec.ts`
- [ ] **Global Types**:
    - `src/types/` -> `@core/types/`
- [ ] **Base Services**:
    - `src/api/gasClient.ts` -> `@core/api/GasClient.ts`
    - Create `@core/services/StorageService.ts` (Wrap IDB/LocalStorage).
    - Create `@core/services/ValidationService.ts` (Wrap Valibot).
- [ ] **Registry**: Create `@core/index.ts` exporting all stable core utils.

### 🟡 Phase 3: Atomic Shared UI (Medium Risk)
Objective: Separate "Dumb" UI from "Smart" Business logic.
- [ ] **UI Extraction**:
    - `src/components/Icon.vue` -> `@shared/ui/Icon.vue`
    - `src/components/StatusPill.vue` -> `@shared/ui/StatusPill.vue`
    - `src/components/BaseCardSkeleton.vue` -> `@shared/ui/BaseCardSkeleton.vue`
- [ ] **Logic Extraction**:
    - `src/composables/useHaptics.ts` -> `@shared/composables/useHaptics.ts`
    - `src/composables/useTheme.ts` -> `@shared/composables/useTheme.ts`
- [ ] **Registry**: Create `@shared/index.ts` for all shared UI atoms.

### 🟢 Phase 4: Feature Encapsulation (High Risk)
Objective: Move towards full domain isolation. Perform one feature at a time.
- [ ] **Feature: Laboratory**
    - Gather `src/logic/Laboratory/` -> `@features/laboratory/logic/`
    - Gather `src/components/Laboratory/` (and recursive) -> `@features/laboratory/components/`
    - Gather `src/composables/useLaboratory.ts` -> `@features/laboratory/composables/`
    - Gather `src/views/LaboratoryView.vue` -> `@features/laboratory/views/`
- [ ] **Feature: Headhunter** (Same pattern)
- [ ] **Stability Check**: After each feature move, run the feature-specific tests.

### 🔵 Phase 5: Routing & App-Level Glue
Objective: Finalize the new entry point.
- [ ] **The Move**:
    - `src/router/` -> `@app/router/`
    - `src/App.vue` -> `@app/App.vue`
    - `src/main.ts` -> `@app/main.ts`
- [ ] **Path Repair**: Batch update all `@/` imports to their specific layer aliases (`@core/`, `@features/`, etc.).
- [ ] **Registry Enforcement**: Check all feature-to-feature imports and replace deep links with Registry imports.

### 🧹 Phase 6: Pruning & Documentation
- [ ] Delete orphaned `src/components`, `src/composables`, and `src/logic` folders.
- [ ] Delete rogue `Frontend-PWA/tests/` folder.
- [ ] Update README with the new architecture diagram.
- [ ] Final Build Verification (`pnpm build`).
