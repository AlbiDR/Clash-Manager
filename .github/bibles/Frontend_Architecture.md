# Clinical Architecture: The "Clean Stack" Protocol

This document serves as the **Single Source of Truth** for the `Clash-Manager` architecture. It strictly defines the structural, nomenclatural, and behavioral standards required to maintain a 100/100 Lighthouse-grade codebase.

---

## 1. The Four Layers of "Antigravity"

We employ a **Strict Unitary Architecture**. Code must live exactly where it belongs.

### Layer 1: Core (@core)
**Definition**: The "Kernel". Code that is biologically necessary for the application to boot, but **agnostic** to the business domain.
- **Rule**: Pure TypeScript only. No Vue components (mostly). No business logic.
- **Contents**:
  - `api/`: abstract HTTP clients (`GasClient`).
  - `theme/`: Design tokens, CSS variables, typography, and `style.css`.
  - `types/`: Brand types (`Flavor<T>`) and global interfaces.
  - `utils/`: Mathematical and string manipulation primitives.
  - `services/`: Wrappers for foundational 3rd-party libs (e.g., Validation, Storage).

### Layer 2: Shared (@shared)
**Definition**: The "Building Blocks". Reusable molecules that have no specific business allegiance.
- **Rule**: Must be generic enough to drop into any other project.
- **Contents**:
  - `ui/`: Dumb components (`Icon`, `Button`, `Card`, `Skeleton`). Zero state.
  - `composables/`: Device/Browser logic (`useHaptics`, `useWakeLock`, `useStorage`).
  - `directives/`: Custom Vue directives (`vTactile`, `vTooltip`).

### Layer 3: Features (@features)
**Definition**: The "Business". Self-contained silos of domain logic.
- **Rule**: A Feature **NEVER** imports from another Feature. Communication happens via URL parameters or Global State (Store).
- **Structure (Fractal)**:
  - `my-feature/`
    - `components/`: Domain-specific UI components (e.g., `RecruitCard.vue`).
    - `composables/`: Feature-local state (Stores) and lifecycle logic.
    - `logic/`: Pure Business Logic / Algorithms / Parsers.
    - `types/`: Feature-local TypeScript definitions.
    - `views/`: The Entry Point (Route) for this feature.
    - `index.ts`: The Public API (See Barrel Protocol).

### Layer 4: App (@app)
**Definition**: The "Glue". Context-aware orchestration.
- **Rule**: The only layer allowed to import from `@features`.
- **Contents**:
  - `router/`: Definitions of routes.
  - `layouts/`: `ConsoleLayout.vue` (The shell).
  - `store/`: Orchestration state that spans multiple features.
  - `main.ts`: The boot sequence.
  - `sw.ts`: PWA Service Worker.

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

---

## 4. State Management & Data Flow

- **Composable as Store**: Feature state lives in a singleton composable within the feature's `composables/` folder.
- **Unidirectional Flow**: Views pass data down; components emit up.
- **Dependency Wrapping**: Foundational 3rd-party libraries MUST be wrapped in `@core/services`.

---

## 5. Testing & Quality Assurance

- **Co-Location**: Tests must live in a `__tests__` directory sibling to the file they are testing.
- **File Suffix**: Use `.spec.ts` or `.test.ts` consistently.
- **Error Resilience**: All Feature Views must be wrapped in a shared `<ErrorBoundary>` component.

---

## 6. Accessibility & Responsiveness

- **Semantic HTML**: Mandatory use of `<nav>`, `<main>`, `<article>`, and `<section>`.
- **ARIA**: Interactive elements must have `aria-label` if no text is present.
- **Touch Targets**: Minimum 44x44px for all mobile interactive elements.

---

## 7. Documentation & Comments

- **Rationale over Implementation**: Explain *why*, not *how*.
- **Strict No-Emoji Rule**: Emojis are forbidden in all documentation, commit messages, and code comments.

---

## 8. The "OCD Verification" Checklist

Before completing any task, every developer (and AI) must verify:
1. [ ] **Location**: Does this file live in the correct layer?
2. [ ] **Registry**: Is it exported via the module's `index.ts`?
3. [ ] **Naming**: Does it follow the strict naming table?
4. [ ] **Wrappers**: Are we using `@core` services instead of direct 3rd party imports?
5. [ ] **Tests**: Is there a corresponding test in a sibling `__tests__` folder?
6. [ ] **Types**: Are all public interfaces explicitly typed? No any.
7. [ ] **Visual Purity**: No emojis present in the code or documentation.

---

## 9. Infrastructure & Dependent Adaptations

The restructure extends beyond the `src/` folder. The following external configurations must be adapted.

### [A] Entry Points & Shell
- **`index.html`** & **`public/404.html`**:
  - *Action*: Update `<script type="module" src="./src/main.ts"></script>` -> `./src/app/main.ts`
- **`sw.ts`**:
  - *Action*: Move to `src/app/sw.ts`.
  - *Action*: Convert internal paths (e.g. `import ... from './utils/idb'`) to `@core/services/StorageService`.

### [B] Vite Build Pipeline
- **`vite.config.ts`**:
  - **Manual Chunks**: Update substring detectors to match new Layer 1-4 paths.
  - **View Exclusion**: Update `VIEW_SPECIFIC_COMPONENTS` to point to `@features/` components.
  - **PWA Configuration**: Set `srcDir: "src/app"` and `filename: "sw.ts"`.

### [C] CI/CD & Validation
- **`.github/scripts/validate_project.ts`**:
  - *Action*: Update `PATHS` object. `backendConfig` -> `Backend-GAS/Configuration.ts`.
  - *Action*: Update logic parity paths if they target `src/utils`.

### [D] TypeScript Configuration
- **`tsconfig.app.json`**:
  - *Action*: Verify `include` captures `src/` and `sw.ts` in its new home.
  - *Action*: Ensure `paths` aliases perfectly match the mapping manifest.

### [E] Design System
- **`style.css`**: Move to `@core/theme/style.css`.
  - *Action*: Verify `@font-face` URL paths (ensure they remain root-relative `/fonts/`).

---

## 10. Migration Roadmap

### Phase 1: Infrastructure & Anchorage (Completed)
- [x] Create directory skeleton.
- [x] Configure `@core`, `@shared`, `@features`, `@app` aliases.

### Phase 2: Core & Shared Extraction
- [ ] **Core**: Move `api/`, `utils/`, `types/`, `icons.ts`, `style.css` -> `@core/`.
- [ ] **Shared**: Move generic components and composables -> `@shared/`.
- [ ] **Directives**: Move `directives/` -> `@shared/directives/`.
- [ ] **Barrels**: Create `index.ts` for Layer 1 and 2.

### Phase 3: Feature Domain Isolation
- [ ] **Laboratory**: Gather logic, components, views, and tests -> `@features/laboratory/`.
- [ ] **Headhunter**: Gather views, useHeadhunter, RecruitCard -> `@features/headhunter/`.
- [ ] **Roster**: Gather LeaderboardView, MemberCard, WarHistoryChart -> `@features/roster/`.
- [ ] **Settings**: Gather SettingsView, all settings sub-components -> `@features/settings/`.

### Phase 4: App Glue & Routing
- [ ] **App**: Move router, layouts, `App.vue`, `main.ts`, `sw.ts` -> `@app/`.
- [ ] **Repair**: Update `index.html` and `public/404.html` script tags.
- [ ] **Sync**: Repair `vite.config.ts` and `tsconfig.app.json`.

### Phase 5: Global Reference Repair
- [ ] **Refactor**: Run automated search/replace for all `@/` to layer-specific aliases.
- [ ] **Verification**: Run `pnpm build` and `pnpm test`.

---

## 11. Cross-Domain Dependents

- **`sync-branches.yml`**: Uses `^Frontend-PWA/` regex, which is **Safe**.
- **README Links**: Verify root and sub-README links remain valid after Bible move.
- **Scoring Parity**: Ensure `validate_project.ts` still finds the warmath logic in its new `@core` home.

---

## 12. File Mapping Manifest

### Layer 1: Core
| Source | Target |
| :--- | :--- |
| `src/api/` | `@core/api/` |
| `src/utils/` | `@core/utils/` |
| `src/types/` | `@core/types/` |
| `src/icons.ts` | `@core/theme/icons.ts` |
| `src/style.css` | `@core/theme/style.css` |
| `src/utils/idb.ts` | `@core/services/StorageService.ts` |

### Layer 2: Shared
| Source | Target |
| :--- | :--- |
| Generic `src/components/` | `@shared/ui/` |
| Generic `src/composables/` | `@shared/composables/` |
| `src/directives/` | `@shared/directives/` |
| `src/components/__tests__/` (shared) | Sibling `__tests__` in `@shared/ui/` |

### Layer 3: Features
| Domain | Mapping |
| :--- | :--- |
| **Laboratory** | `src/logic/Laboratory/` + components -> `@features/laboratory/` |
| **Headhunter** | `RecruiterView` + `RecruitCard` + relevant composables -> `@features/headhunter/` |
| **Roster** | `LeaderboardView` + `MemberCard` + `WarHistoryChart` -> `@features/roster/` |
| **Settings** | `SettingsView` + `src/components/settings/` -> `@features/settings/` |

### Layer 4: App
| Source | Target |
| :--- | :--- |
| `src/router/` | `@app/router/` |
| `src/App.vue`, `src/main.ts` | `@app/` |
| `src/sw.ts` | `@app/sw.ts` |
| Shell Layout Components | `@app/layouts/` |
