# Surgical Migration Plan (Protocol 63)

This is the high-precision tactical manifest for the `Clash-Manager` restructure.
**Status**: Tactical Draft 63.
**Objective**: 100% build-stability during the transition.

---

## Phase 0: Pre-Flight Verification
Before touching a single file, absolute environment stability must be verified.
- [ ] **Clean Git**: `git status` must be empty.
- [ ] **Technical baseline**: `pnpm build` and `pnpm test` must be passing.
- [ ] **Branch**: Ensure on `Restructure`.

---

## Phase 1: Infrastructure Anchorage
*Goal: Prepare the destination and the resolution logic.*

### [1.1] Directory Skeleton
```bash
mkdir -p src/core/{api,services,theme,types,utils}
mkdir -p src/shared/{components,composables,directives}
mkdir -p src/features/{laboratory,headhunter,roster,settings}/{components,composables,logic,types,views}
mkdir -p src/app/{router,layouts,store}
```

### [1.2] Storage Convergence (Critical)
- **Target**: `src/utils/idb.ts` -> `src/core/services/StorageService.ts`
- **Action**: Change `DB_NAME` to `clash_manager_v11` and `STORE_NAME` to `keyval` across both App and `sw.ts`.

### [1.3] Registry Setup
- [ ] Initialize `src/core/index.ts` and `src/shared/index.ts` (Empty barrels).
- [ ] Update `vite.config.ts` and `tsconfig.app.json` with the Layer 1-4 aliases.

---

## Phase 2: Layer 1 Extraction (The Kernel)
*Risk: High. Core logic moves.*

| Source File | Destination | Validation |
| :--- | :--- | :--- |
| `src/api/gasClient.ts` | `src/core/api/GasClient.ts` | Type-check post move |
| `src/utils/idb.ts` | `src/core/services/StorageService.ts` | SW Import Fix |
| `src/utils/warMath.ts` | `src/core/utils/warMath.ts` | Backend Parity Test |
| `src/icons.ts` | `src/core/theme/icons.ts` | UI Icon Render |
| `src/style.css` | `src/core/theme/style.css` | Main CSS Reference |

**Action**: Move `src/api/__tests__/*` to `src/core/api/__tests__/`.

---

## Phase 3: Layer 2 Extraction (Shared Molecules)
*Risk: Moderate. Mostly UI and simple composables.*

### [3.1] Shared UI Components
```bash
git mv src/components/Icon.vue src/shared/components/
git mv src/components/SkeletonCard.vue src/shared/components/
git mv src/components/BaseCard.vue src/shared/components/
git mv src/components/Badge.vue src/shared/components/
git mv src/components/ErrorState.vue src/shared/components/
```

### [3.2] Shared Composables & Directives
```bash
git mv src/composables/useHaptics.ts src/shared/composables/
git mv src/composables/useWakeLock.ts src/shared/composables/
git mv src/directives/vTactile.ts src/shared/directives/
git mv src/directives/vTooltip.ts src/shared/directives/
```

---

## Phase 4: Layer 3 Isolation (Feature Enclosure)
*Risk: Moderate. Fractalizing the app logic.*

### [4.1] Laboratory Domain
- **Logic**: `src/logic/Laboratory/*` -> `src/features/laboratory/logic/`
- **Composable**: `src/composables/useLaboratory.ts` -> `src/features/laboratory/composables/`
- **View**: `src/views/LaboratoryView.vue` -> `src/features/laboratory/views/`
- **Components**: `src/components/SummaryCard.vue` -> `src/features/laboratory/components/`

### [4.2] Headhunter Domain
- **Composable**: `src/composables/useHeadhunter.ts` -> `src/features/headhunter/composables/`
- **View**: `src/views/RecruiterView.vue` -> `src/features/headhunter/views/`
- **Components**: `src/components/RecruitCard.vue` -> `src/features/headhunter/components/`

### [4.3] Roster Domain
- **View**: `src/views/LeaderboardView.vue` -> `src/features/roster/views/`
- **Components**: `src/components/MemberCard.vue`, `src/components/WarHistoryChart.vue` -> `src/features/roster/components/`

---

## Phase 5: Layer 4 Convergence (App Glue)
*Risk: Critical. Entry point and Shell reconstruction.*

- **Layouts**: `src/components/ConsoleLayout.vue`, `FloatingDock.vue` -> `src/app/layouts/`
- **Entry**: `src/main.ts`, `src/App.vue`, `src/sw.ts` -> `src/app/`
- **Infrastructure Repair**: 
  - Update `index.html` script source.
  - Update `public/404.html` script source.
  - Repair `sw.ts` precache glob to ensure it still finds chunks in `dist`.

---

## Phase 6: Global Refactor & Alignment
*Goal: Zero orphaned aliases.*

1. **Bulk Regex**: Replace all `import ... from "@/..."` with layer-specific aliases (`@core/`, `@shared/`, etc.) based on the new manifest.
2. **Barrel Completion**: Export all public interfaces from each feature's `index.ts`.
3. **Dead Code Hunt**: Remove empty folders and unused imports.

---

## Command Checkpoints (The QA Rubrik)
After every Phase, run the following "Stability Cycle":
1. `pnpm type-check` (Must have 0 errors)
2. `pnpm build` (Must complete)
3. `pnpm test` (Logic must hold)
