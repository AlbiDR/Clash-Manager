# Clinical Architecture: The "Clean Stack" Protocol

This document serves as the **Single Source of Truth** for the `Clash-Manager` architecture. It strictly defines the structural, nomenclatural, and behavioral standards required to maintain a 100/100 Lighthouse-grade codebase.

---

## 1. The Four Layers of "Antigravity"

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

## 2. Infrastructure & Systemic Adaptations (The "Repair" Plan)

To ensure zero errors, the following static anchor points MUST be updated simultaneously with the file moves.

### [A] Entry Points & Shell Repair
- **`index.html`** & **`public/404.html`**:
  - *Current*: `<script type="module" src="./src/main.ts"></script>`
  - *New*: `<script type="module" src="./src/app/main.ts"></script>`
  - *Fonts*: Standardize fonts preloading to use absolute root-relative paths `/fonts/...` to ensure `style.css` movement doesn't break references.

### [B] Vite Build Pipeline (`vite.config.ts`)
- **Manual Chunks**: Update substring detectors to match the new aliased structure:
  - `id.includes("@core")` -> `core-api`
  - `id.includes("@features")` -> `business-logic`
  - `id.includes("@shared")` -> `ui-shared`
- **View-Specific Exclusion**: Update `VIEW_SPECIFIC_COMPONENTS` to reference `@features` instead of `/src/components/`.
- **PWA Settings**: 
  - `srcDir: "src/app"`
  - `filename: "sw.ts"`

### [C] TypeScript Configuration (`tsconfig.app.json`)
- **Paths Manifest**: Verify aliases strictly match:
  - `@/*`: `["src/*"]`
  - `@core/*`: `["src/core/*"]`
  - `@shared/*`: `["src/shared/*"]`
  - `@features/*`: `["src/features/*"]`
  - `@app/*`: `["src/app/*"]`

---

## 3. Storage Convergence Protocol (CRITICAL FIX)

I have identified that the `sw.ts` and `App` currently use different database names. This MUST be unified during Phase 1.

- **Storage Service (`@core/services/StorageService.ts`)**:
  - `DB_NAME`: `clash_manager_v11` (Standardize)
  - `STORE_NAME`: `keyval` (Standardize)
- **Required Action**: Migrate all `idb.open(...)` calls to use this single source of truth to ensure notification badge parity.

---

## 4. Migration Roadmap (Clinical Sequence)

### Phase 1: Storage & Infrastructure (Anchorage)
- [ ] Refactor `idb.ts` -> `@core/services/StorageService.ts`. Unify DB constants.
- [ ] Update `vite.config.ts` and `tsconfig.app.json` with the Layer 1-4 registry.
- [ ] Create directory skeleton for `@core`, `@shared`, `@features`, `@app`.

### Phase 2: Fundamental Extraction
- [ ] **Core**: Move `api/`, `utils/`, `types/`, `style.css`, `icons.ts` -> `@core/`.
- [ ] **Shared**: Move `directives/`, generic components (Icon, Skeleton), generic composables -> `@shared/`.
- [ ] **Directives**: Move `directives/` -> `@shared/directives/`.

### Phase 3: Domain Isolation (Feature Splitting)
- [ ] **Laboratory**: Move `Laboratory_Kernel.ts`, `Laboratory_Adapter.ts`, `Laboratory_Tables.ts`, `LaboratoryView.vue` -> `@features/laboratory/`.
- [ ] **Headhunter**: Move `RecruiterView.vue`, `RecruitCard.vue`, `useHeadhunter.ts` -> `@features/headhunter/`.
- [ ] **Roster**: Move `LeaderboardView.vue`, `MemberCard.vue`, `WarHistoryChart.vue` -> `@features/roster/`.
- [ ] **Settings**: Move `SettingsView.vue`, `components/settings/` -> `@features/settings/`.

### Phase 4: App Orchestration (The Glue)
- [ ] **App**: Move `router/`, `App.vue`, `main.ts`, `sw.ts` -> `@app/`.
- [ ] **Repair**: Update script tags in `index.html` and `404.html`.
- [ ] **PWA**: Verify `registerType: 'autoUpdate'` in Vite config.

### Phase 5: Pruning & Global Repair
- [ ] **Refactor**: Bulk replacement of all `@/` to layer-specific aliases.
- [ ] **Verification**: Run `pnpm build` and `pnpm test`.

---

## 5. File Mapping Manifest (High Precision)

### Layer 1: Core
| Source | Target (Alias) |
| :--- | :--- |
| `src/api/gasClient.ts` | `@core/api/GasClient.ts` |
| `src/utils/idb.ts` | `@core/services/StorageService.ts` |
| `src/utils/warMath.ts` | `@core/utils/warMath.ts` |
| `src/types/index.ts` | `@core/types/index.ts` |
| `src/style.css` | `@core/theme/style.css` |
| `src/icons.ts` | `@core/theme/icons.ts` |

### Layer 2: Shared
| Source | Target (Alias) |
| :--- | :--- |
| `src/components/Icon.vue` | `@shared/ui/Icon.vue` |
| `src/composables/useHaptics.ts` | `@shared/composables/useHaptics.ts` |
| `src/directives/vTactile.ts` | `@shared/directives/vTactile.ts` |
| `src/components/SkeletonCard.vue`| `@shared/ui/SkeletonCard.vue` |

### Layer 3: Features (Domain Blocks)
| Domain | Files to Move |
| :--- | :--- |
| **Laboratory** | `src/logic/Laboratory/*`, `src/views/LaboratoryView.vue`, `src/composables/useLaboratory.ts` |
| **Headhunter** | `src/views/RecruiterView.vue`, `src/components/RecruitCard.vue`, `src/composables/useHeadhunter.ts` |
| **Roster** | `src/views/LeaderboardView.vue`, `src/components/MemberCard.vue`, `src/components/WarHistoryChart.vue` |
| **Settings** | `src/views/SettingsView.vue`, `src/components/settings/*` |

### Layer 4: App (Infrastructure)
| Source | Target (Alias) |
| :--- | :--- |
| `src/router/index.ts` | `@app/router/index.ts` |
| `src/main.ts` | `@app/main.ts` |
| `src/App.vue` | `@app/App.vue` |
| `src/sw.ts` | `@app/sw.ts` |
| `src/components/FloatingDock.vue` | `@app/layouts/FloatingDock.vue` |

---

## 6. The "OCD Verification" Checklist

Before completing any task, verify:
1. [ ] **Location**: Does this file live in the correct layer?
2. [ ] **Registry**: Is it exported via the module's `index.ts` (Barrel Protocol)?
3. [ ] **DB Parity**: Integrated with the unified StorageService?
4. [ ] **Tests**: Corresponding `.spec.ts` exists in a sibling `__tests__` folder?
5. [ ] **A11y**: ARIA labels and touch targets valid?
6. [ ] **Visual Purity**: Absolutely zero emojis present.
