# Surgical Migration Plan (Protocol 63)

This is the high-precision tactical manifest for the `Clash-Manager` restructure.
**Status**: Tactical Draft 63.
**Objective**: 100% build-stability and zero cross-domain communication failure.

---

## Phase 0: Pre-Flight & Anchor Audit
*Goal: Ensure the bridge between GAS and Frontend remains intact.*

- [x] **Git Cleanliness**: Stash all local changes.
- [ ] **Handshake Verification**: Run `.github/scripts/validate_project.ts` to ensure current state is 100% green.
- [ ] **GAS Dependency Check**: Verify `Backend-GAS/Configuration.ts` points to the root `/Clash-Manager/`. **Status**: Verified (Not moving).
- [ ] **CI/CD Path Check**: Verify `.github/workflows/deploy-pwa.yml` uses `working-directory: Frontend-PWA`. **Status**: Verified (Not moving).

---

## Phase 1: Infrastructure Anchorage
*Goal: Prepare the destination and the resolution logic.*

### [1.1] Directory Skeleton
```bash
# Execute from Frontend-PWA root
mkdir -p src/core/{api,services,theme,types,utils}
mkdir -p src/shared/{ui,composables,directives}
mkdir -p src/features/{laboratory,headhunter,roster,settings}/{components,composables,logic,types,views}
mkdir -p src/app/{router,layouts,store}
```

### [1.2] Storage Convergence (CRITICAL FOR BACKEND SYNC)
- **Target**: `src/utils/idb.ts` -> `src/core/services/StorageService.ts`
- **Action**: Unify DB constants to prevent "Split-Brain" storage between App and Service Worker.
- **Verification**: `sw.ts` and `StorageService.ts` must both reference `DB: clash_manager_v11` and `STORE: keyval`.

### [1.3] Registry Setup
- [ ] Initialize `index.ts` barrels for every new folder.
- [ ] Update `vite.config.ts` and `tsconfig.app.json` with Layer 1-4 aliases.

---

## Phase 2: Layer 1 Extraction (The Kernel)
*Risk: High. Core logic moves.*

| Source File | Destination | Action |
| :--- | :--- | :--- |
| `src/api/gasClient.ts` | `src/core/api/GasClient.ts` | Update internal `import type` |
| `src/utils/idb.ts` | `src/core/services/StorageService.ts`| Internal logic cleanup |
| `src/utils/warMath.ts` | `src/core/utils/warMath.ts` | Export calculation logic |
| `src/icons.ts` | `src/core/theme/icons.ts` | Export `ICONS` object |
| `src/style.css` | `src/core/theme/style.css` | Update font preloads in index.html |

---

## Phase 3: Layer 2 Extraction (Shared Molecules)
*Risk: Moderate. UI and simple browser logic.*

- **UI**: Move `src/components/Icon.vue`, `Badge.vue`, `BaseCard.vue` -> `src/shared/ui/`.
- **Logic**: Move `src/composables/useHaptics.ts`, `useWakeLock.ts` -> `src/shared/composables/`.
- **Directives**: Move `src/directives/*.ts` -> `src/shared/directives/`.

---

## Phase 4: Layer 3 Isolation (Feature Enclosure)
*Risk: Moderate. Business logic compartmentalization.*

### [4.1] Laboratory Domain
- Move `src/logic/Laboratory/*`, `LaboratoryView.vue`, `useLaboratory.ts` -> `src/features/laboratory/`.
- **Validation**: Ensure `Laboratory_Kernel` remains agnostic of the view.

### [4.2] Headhunter Domain
- Move `src/views/RecruiterView.vue`, `src/components/RecruitCard.vue`, `useHeadhunter.ts` -> `src/features/headhunter/`.
- **Validation**: Test recruitment dismissal animation.

---

## Phase 5: Layer 4 Convergence (App Glue)
*Risk: Critical. Entry point and Shell reconstruction.*

- **Layouts**: Move `ConsoleLayout.vue`, `FloatingDock.vue` -> `src/app/layouts/`.
- **Shell**: Move `router/`, `App.vue`, `main.ts`, `sw.ts` -> `src/app/`.
- **Repair (Surgical)**:
  - `index.html`: Update `<script src="./src/app/main.ts">`
  - `404.html`: Update `<script src="./src/app/main.ts">`
  - `vite.config.ts`: Update `VitePWA` configs (`srcDir: "src/app"`, `filename: "sw.ts"`)

---

## Phase 6: Global Alignment & Verification
*Goal: Zero orphaned aliases and a passing build.*

1. **Path Alignment**: Bulk replace `@/` with `@core/`, `@features/`, etc.
2. **Registry Completion**: Ensure every feature `index.ts` is fully populated.
3. **The Stability Rubrik**:
   - [ ] `pnpm type-check`
   - [ ] `pnpm build`
   - [ ] `pnpm test`
   - [ ] **Handshake Test**: Open local dev server, verify GAS data flows into the Roster.
4. **Pruning**: Delete old empty directories.
