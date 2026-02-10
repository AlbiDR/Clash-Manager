# Surgical Migration Plan (Protocol 90)

This is the high-precision tactical manifest for the `Clash-Manager` restructure.
**Status**: Tactical Draft 90 (Ultra-Precision Hardened)
**Objective**: 100% build-stability and zero cross-domain communication failure.

---

## Phase 0: Pre-Flight & Anchor Audit
*Goal: Ensure the bridge between GAS and Frontend remains intact.*

- [x] **Git Cleanliness**: Stash all local changes.
- [x] **Technical baseline**: `pnpm build` and `pnpm test` must be passing.
- [ ] **Handshake Verification**: Run `.github/scripts/validate_project.ts` to ensure current state is 100% green.
- [ ] **GAS Dependency Check**: Verify `Backend-GAS/Configuration.ts` points to the root `/Clash-Manager/`. **Status**: Verified.
- [ ] **CI/CD Path Check**: Verify `.github/workflows/deploy-pwa.yml` uses `working-directory: Frontend-PWA`. **Status**: Verified.

---

## Phase 1: Infrastructure Anchorage
*Goal: Prepare the destination and the resolution logic.*

### [1.1] Directory Skeleton
```bash
# Execute from Frontend-PWA root
mkdir -p src/core/{api,services,theme,types,utils}
mkdir -p src/shared/{ui,composables,directives}
mkdir -p src/features/{laboratory,headhunter,roster,settings}/{components,composables,logic,types,views}
mkdir -p src/app/{router,layouts}
```

### [1.2] Storage Convergence (CRITICAL FOR BACKEND SYNC)
- **Target**: `src/utils/idb.ts` -> `src/core/services/StorageService.ts`
- **Action**: Unify DB constants to prevent "Split-Brain" storage between App and Service Worker.
- **Verification**: `sw.ts` and `StorageService.ts` must both reference `DB: clash_manager_v11` and `STORE: keyval`.
- **Legacy Migration**: Implement bridge logic (Phase 5.1 detail) to migrate old `keyval-store` data.

---

## Phase 2-4: Extraction Gradation
*(Moving from Easiest to Hardest as per Protocol 85)*

1. **Level 1**: Styles and Icons -> `@core/theme/`
2. **Level 2**: Shared UI and Directives -> `@shared/`
3. **Level 3**: Global Types and Math Utils -> `@core/`
4. **Level 4**: Feature Domain Splitting -> `@features/`

---

## Phase 5: The "Hardest" Failpoints (Terminal Moves)

### [5.1] Entry Terminal Metamorphosis
- **Action**: `git mv src/main.ts src/app/main.ts`, `git mv src/App.vue src/app/App.vue`
- **Repair**:
  - `index.html`: Update `<script type="module" src="/src/app/main.ts"></script>`
  - `404.html`: Update `<script type="module" src="/src/app/main.ts"></script>`
- **Validation**: `pnpm build` must pass immediately after this move.

### [5.2] Service Worker Calibration
- **Action**: `git mv src/sw.ts src/app/sw.ts`
- **Vite Config**: Update `VitePWA` -> `srcDir: "src/app"`, `filename: "sw.ts"`.
- **Validation**: Inspect `dist/sw.js` to ensure the precache hash is valid and non-empty.

---

## Phase 6: Manual Intervention Checklist (USER ACTIONS)
*The following items require manual handling or monitoring outside of automated scripts.*

1. **[MANUAL] GitHub Secrets Refresh**:
   - If the PWA's `VITE_GAS_URL` or `VITE_WORKER_URL` are changed in the process, they must be updated in the GitHub Repo Secrets (`Settings > Secrets and variables > Actions`).
2. **[MANUAL] GAS Deployment (Conditional)**:
   - If the `validate_project.ts` check detects a scoring logic mismatch after moving `warMath.ts`, you MUST **re-deploy the Google Apps Script** to ensure parity between the backend and the new frontend location.
3. **[MANUAL] Browser Cache Persistence**:
   - Because the Service Worker location is moving, some users' browsers might hold onto the old `sw.js` for one session. Users should be advised to **"Pull to Refresh"** once or **"Force Reload"** (Cmd+Shift+R) if they see the old UI layout.
4. **[MANUAL] Local .env Sync**:
   - Developers must manually update their local `.env` if they utilize absolute file paths for local testing (rare, but possible).

---

## Dry Run Risk Re-evaluation (The "Protocol 90" Rubrik)

| Failure Point | Probable Cause | Severity | Mitigation |
| :--- | :--- | :--- | :--- |
| **PWA Precaching Leak** | `sw.ts` can't find chunks in `dist` due to `srcDir` change. | **CRITICAL** | Vite-PWA `srcDir` must match the new `src/app` home. |
| **Path Shell-Shock** | Relative imports in `sw.ts` to `utils/idb` break. | **HIGH** | Refactor `sw.ts` to use absolute alias `@core/services/StorageService`. |
| **Case-Sensitivity Error**| `import ... from "./logic/Laboratory"` (works on Mac, fails on Linux). | **MEDIUM** | Strict adherence to the Bible's `kebab-case` directory naming. |
| **Split-Brain Storage** | Migration bridge fails to copy `VITE_GAS_URL` from old DB. | **CRITICAL** | Phase 1.2 "Legacy Bridge" must be the first logic piece written. |
| **GAS Validation Fail** | CI/CD script doesn't find `Configuration.ts` or `warMath.ts`. | **MEDIUM** | Update `validate_project.ts` and `validate_scoring.ts` paths in Phase 1. |
