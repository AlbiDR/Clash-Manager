# Surgical Migration Plan: "Clean Stack" Restructure
**Protocol**: Difficulty-Weighted Gradient (Easiest -> Hardest)
**Status**: Tactical Draft 85 (Includes Legacy Storage Bridge)

---

## [LEVEL 0] The Skeleton Initialization (Easiest)
*Goal: Create the destination without affecting the source.*

- [ ] **Phase 0.1: Skeleton Creation**
  ```bash
  mkdir -p src/core/{api,services,theme,types,utils}
  mkdir -p src/shared/{ui,composables,directives}
  mkdir -p src/features/{laboratory,headhunter,roster,settings}/{components,composables,logic,types,views}
  mkdir -p src/app/{router,layouts}
  ```
- [ ] **Phase 0.2: Infrastructure Registry**
  - Update `vite.config.ts` and `tsconfig.app.json` with the Layer 1-4 aliases.
  - Create empty `index.ts` barrels in each main layer.

---

## [LEVEL 1] Visual Tokens & Style Migration (Low Risk)
*Goal: Move the design system foundations.*

- [ ] **Phase 1.1: Styles & Fonts**
  - Move `src/style.css` -> `src/core/theme/style.css`.
  - **Repair**: Update font paths to root-relative `/fonts/` to ensure zero breakages.
- [ ] **Phase 1.2: Icon Registry**
  - Move `src/icons.ts` -> `src/core/theme/icons.ts`.
  - Update imports in `Icon.vue` (Temporary path).

---

## [LEVEL 2] Generic Atoms & Shared Logic (Moderate Risk)
*Goal: Move the domain-blind building blocks.*

- [ ] **Phase 2.1: Shared UI Components**
  - Move `Icon.vue`, `Badge.vue`, `BaseCard.vue`, `SkeletonCard.vue` -> `src/shared/ui/`.
- [ ] **Phase 2.2: Global Directives**
  - Move `vTactile.ts`, `vTooltip.ts` -> `src/shared/directives/`.
- [ ] **Phase 2.3: Utility Composables**
  - Move `useHaptics.ts`, `useWakeLock.ts` -> `src/shared/composables/`.

---

## [LEVEL 3] The Logic Kernel (High Logic Impact)
*Goal: Move the engine that drives the data.*

- [ ] **Phase 3.1: Global Types & Utils**
  - Move `src/types/` -> `src/core/types/`.
  - Move `src/utils/warMath.ts` -> `src/core/utils/warMath.ts`.
- [ ] **Phase 3.2: API Transport**
  - Move `src/api/gasClient.ts` -> `src/core/api/GasClient.ts`.
  - Update `.github/scripts/validate_project.ts` paths immediately.

---

## [LEVEL 4] Feature Silo Decoupling (High Architectural Impact)
*Goal: Fractalize the application into domain islands.*

- [ ] **Phase 4.1: Domain Extraction**
  - Gather views and local logic for `Laboratory`, `Headhunter`, `Roster`, and `Settings`.
  - Enforce "No Cross-Feature Import" rule.
- [ ] **Phase 4.2: Registry Enforcement**
  - Populate feature `index.ts` files with Public APIs.

---

## [LEVEL 5] The Storage Unification & Legacy Bridge (Critical Data Risk)
*Goal: Fix the "Split-Brain" DB issue without losing user settings.*

- [ ] **Phase 5.1: Storage Convergence**
  - Move `src/utils/idb.ts` -> `src/core/services/StorageService.ts`.
  - Implement a **Legacy Migration Guard** to copy keys from old DB names (`clash_manager_db`, `keyval-store`) to the new unified `clash_manager_v11`.

---

## [LEVEL 6] The Final Shell Metamorphosis (Hardest / Critical Fail Point)
*Goal: Relocate the entry terminal and boot sequence.*

- [ ] **Phase 6.1: Layout & Router**
  - Move `ConsoleLayout.vue`, `FloatingDock.vue` -> `src/app/layouts/`.
  - Move `router/` -> `src/app/router/`.
- [ ] **Phase 6.2: Terminal Move**
  - Move `main.ts`, `App.vue`, `sw.ts` -> `src/app/`.
- [ ] **Phase 6.3: Infrastructure Repair**
  - Update script tags in `index.html` and `404.html`.
  - Re-calibrate Vite PWA plugin paths.

---

## Stability Verification Rubrik (The QA Gate)
1. **The Build Check**: `pnpm build` must pass.
2. **The Logic Check**: `pnpm test` must be 100% green.
3. **The Data Check**: Verify `VITE_GAS_URL` persists post-update.
