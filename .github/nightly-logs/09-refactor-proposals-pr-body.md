### Nightly Stage 9: Refactor - Structural Surgery Engineer

**Status:** CHANGED

In plain terms: this changes 1 code file, so the app's behaviour may be affected. No tests were added or changed alongside it.

**What changed:** Removed dead AndroidCalibrationSettings re-export from settings components barrel

**Why:** Target B.4: AndroidCalibrationSettings is imported directly by FeatureSettings.vue and not used through the settings components barrel

**Result:** pnpm -F clash-manager-pwa type-check PASS; vitest PASS; depcruise PASS

**Files changed:** .github/nightly-logs/09-refactor-proposals-coverage.log, Frontend-PWA/src/features/settings/components/index.ts

<!--
NIGHTLY_PR_METADATA:
  Domain: architecture
  Why: Target B.4: AndroidCalibrationSettings is imported directly by FeatureSettings.vue and not used through the settings components barrel
  Change: Removed dead AndroidCalibrationSettings re-export from settings components barrel
  Result: pnpm -F clash-manager-pwa type-check PASS; vitest PASS; depcruise PASS
  Files: .github/nightly-logs/09-refactor-proposals-coverage.log, Frontend-PWA/src/features/settings/components/index.ts
  Nudges: 0
-->
