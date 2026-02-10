# Surgical Migration Plan: "Clean Stack" Restructure
**Protocol**: Difficulty-Weighted Gradient
**Status**: Tactical Draft 90 (Ultra-Precision Hardened)

---

## [LEVEL 0] The Skeleton Initialization (Easiest)
*(Completed)*

---

## [LEVEL 1-4] Extraction Phases
*(See Bible for basic mappings. Focus here on high-resistance sectors.)*

---

## [LEVEL 5] The Storage Unification & Legacy Bridge (CRITICAL DATA RISK)
*Goal: Fix the "Split-Brain" DB issue without losing user settings.*

### [5.1] The StorageService Implementation
- **Target**: `src/core/services/StorageService.ts`
- **Hardcore Detail**: The service must include the following **Legacy Migration Guard** during its `init` phase:
```typescript
/**
 * LEGACY MIGRATION GUARD (Phase 1)
 * Detects 'keyval-store' (SW) and 'clash_manager_db' (App).
 * Migrates all entries to 'clash_manager_v11'.
 */
async function migrateLegacyData() {
  const oldDbs = ['keyval-store', 'clash_manager_db'];
  const newDbName = 'clash_manager_v11';
  
  for (const oldDb of oldDbs) {
     // 1. Check if old DB exists and copy keys
     // 2. Clear old DB only after successful migration
     // This ensures VITE_GAS_URL is never lost.
  }
}
```

---

## [LEVEL 6] The Final Shell Metamorphosis (HARDEST / CRITICAL FAIL POINT)
*Goal: Relocate the entry terminal and boot sequence.*

### [6.1] The Entry Pivot
- **Files**: `git mv src/main.ts src/app/main.ts`
- **Files**: `git mv src/App.vue src/app/App.vue`
- **Hardcore Detail**: The `index.html` and `public/404.html` must be updated in the SAME commit as the file move to prevent a broken site state on deploy.
```html
<!-- index.html / 404.html -->
<script type="module" src="/src/app/main.ts"></script>
```

### [6.2] The Service Worker Calibration
- **Move**: `git mv src/sw.ts src/app/sw.ts`
- **Vite Configuration (`vite.config.ts`)**:
  - Update `VitePWA` plugin:
    ```typescript
    VitePWA({
      srcDir: 'src/app', // Pivotal change
      filename: 'sw.ts',
      // ...
    })
    ```
- **Internal Paths**: Inside `sw.ts`, all imports from `utils/idb` must be updated to `@core/services/StorageService`.

### [6.3] Deployment "Shadow" Verification
- **Test**: Run `pnpm build`.
- **Verify**: Inspect `dist/index.html`. It MUST point to a hashed JS file.
- **Verify**: Inspect `dist/sw.js`. It MUST contain the precache manifest.
- **Handshake**: Verify the background sync `offline-queue-sync` still registers correctly in the browser console.

---

## Stability Verification Rubrik (The QA Gate)
1. **The Build Check**: `pnpm build` (Must pass).
2. **The Logic Check**: `pnpm test` (Must be 100% green).
3. **The Data Check**: **MANDATORY** - Verify `VITE_GAS_URL` in LocalStorage/IDB didn't vanish.
4. **The SW Check**: Browser `Application` tab must show `sw.js` active from the new location.
