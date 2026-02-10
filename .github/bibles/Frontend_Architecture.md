# Clinical Architecture: The "Clean Stack" Protocol

This document serves as the **Single Source of Truth** for the `Clash-Manager` architecture. It strictly defines the structural, nomenclatural, and behavioral standards required to maintain a 100/100 Lighthouse-grade codebase.

---

## 1. The Four Layers of "Antigravity"

### Layer 1: Core (@core) [Kernel]
**Definition**: Agnostic infrastructure. If the business fails, the Core must still be able to boot and perform its basic duties (logging, storage, API transport).
- **Contents**:
  - `api/`: Abstract HTTP clients (`GasClient.ts`).
  - `theme/`: Design tokens, `icons.ts`, and `style.css`.
  - `services/`: Infrastructure-level singletons (e.g., `StorageService.ts`).
  - `types/`: Global and brand types (`PlayerData`, `Role`).
  - `utils/`: Algorithmic primitives (e.g., `warMath.ts`).

### Layer 2: Shared (@shared) [Molecules]
**Definition**: UI and logic building blocks that are domain-blind.
- **Contents**:
  - `ui/`: Stateless components (`Icon.vue`, `Button.vue`, `SkeletonCard.vue`).
  - `composables/`: Cross-cutting browser/hardware logic (`useHaptics`, `useWakeLock`).
  - `directives/`: Global Vue directives (`vTactile`, `vTooltip`).

### Layer 3: Features (@features) [Business]
**Definition**: Self-contained domain silos. They are "islands" that communicate via parameters or the URL.
- **Structure**:
  - `laboratory/`: Simulation and optimization logic + view.
  - `headhunter/`: Recruitment discovery and pool management.
  - `roster/`: Performance tracking and leaderboard.
  - `settings/`: App configuration UI.

### Layer 4: App (@app) [Glue]
**Definition**: Orchestration layer. Aggregates features into a cohesive user journey.
- **Contents**:
  - `router/`: Definitions and transitions.
  - `layouts/`: The `ConsoleLayout.vue` shell.
  - `App.vue` & `main.ts`: Entry points.
  - `sw.ts`: PWA Service Worker (Lifecycle glue).

---

## 2. Infrastructure & Systemic Dependents

A zero-error transition requires updating these "Static Anchor Points."

### [A] Entry Point Repair
- **`index.html`** & **`public/404.html`**:
  - Update: `<script type="module" src="./src/main.ts"></script>` -> `./src/app/main.ts`.
  - Sync: Fix font preloads to use stable root-relative `/fonts/` paths consistently.

### [B] Service Worker & Storage Convergence (CRITICAL)
- **Problem**: Current App and SW use conflicting DB names (`clash_manager_db` vs `keyval-store`).
- **Fix**: Centralize DB declaration in `@core/services/StorageService.ts`.
  - `DB_NAME`: `clash_manager_v11`
  - `STORE_NAME`: `keyval`
- **SW Repair**: `sw.ts` must be refactored to use the unified service to ensure background sync and badge count parity.

### [C] Vite Build Pipeline
- **Chunking**: Update `manualChunks` patterns to target layer aliases:
  - `id.includes("@core")` -> `core-api`.
  - `id.includes("@features")` -> `business-logic`.
  - `id.includes("@shared")` -> `ui-shared`.
- **View Exclusion**: Update `VIEW_SPECIFIC_COMPONENTS` from `/src/components/` to `@features/`.

### [D] TypeScript Reference Integrity
- `tsconfig.app.json`: Ensure `paths` aliases perfectly reflect the mapping manifest.
- `tsconfig.json`: Maintain references to `virtual:pwa-register/vue`.

---

## 3. Mandatory Naming Protocol

| Type | Case | Example |
| :--- | :--- | :--- |
| **Logic/Services** | `PascalCase` | `StorageService.ts`, `GasClient.ts` |
| **Composables** | `camelCase` (use-prefix) | `useHaptics.ts` |
| **Views/Components** | `PascalCase` | `RosterView.vue`, `Card.vue` |
| **Registries** | `kebab-case` (lowercase) | `index.ts` (inside kebab directories) |

---

## 4. Migration Manifest (The Final Map)

### Phase 1: Storage Convergence (Prerequisite)
- [ ] Move `src/utils/idb.ts` -> `@core/services/StorageService.ts`.
- [ ] Update `StorageService` constants (`DB: clash_manager_v11`, `STORE: keyval`).
- [ ] Refactor `sw.ts` to use new constants (pre-move).

### Phase 2: Layered Core & Shared
- [ ] **Core**: Move `api/`, `utils/`, `types/`, `style.css`, `icons.ts` -> `@core/`.
- [ ] **Shared**: Move `directives/`, generic components (Icon, Skeleton), generic composables -> `@shared/`.
- [ ] **Tests**: Move root `tests/` and `src/components/__tests__` to sibling `__tests__` folders within their respective feature modules.

### Phase 3: Domain Isolation
- [ ] **Roster**: `LeaderboardView`, `MemberCard`, `WarHistoryChart` -> `@features/roster/`.
- [ ] **Headhunter**: `RecruiterView`, `RecruitCard`, `useHeadhunter` -> `@features/headhunter/`.
- [ ] **Laboratory**: Kernel, Adapter, `LaboratoryView` -> `@features/laboratory/`.
- [ ] **Settings**: `SettingsView`, components/settings/ -> `@features/settings/`.

### Phase 4: App Orchestration
- [ ] **App**: `router/`, `App.vue`, `main.ts`, `sw.ts` -> `@app/`.
- [ ] **Repair**: Update `index.html`, `404.html`, `vite.config.ts`, `tsconfig.app.json`.

### Phase 5: Pruning
- [ ] Run `pnpm build` and `pnpm test`. Eliminate all `@/` references in favor of explicit layer aliases.

---

## 5. OCD Verification Checklist

1. [ ] **Location**: Does this file live in the correct layer?
2. [ ] **Registry**: Is it exported via the module's `index.ts`?
3. [ ] **Naming**: Does it follow the strict naming table?
4. [ ] **DB Parity**: Does `sw.ts` and `App` use the same DB/Store?
5. [ ] **Visual Purity**: No emojis in code or comments.
6. [ ] **Test Co-location**: Is `.spec.ts` a sibling of the source file?
7. [ ] **Path Safety**: Are all fonts root-relative `/fonts/`?
