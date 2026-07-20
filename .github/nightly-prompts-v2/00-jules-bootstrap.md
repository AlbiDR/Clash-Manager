// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# Jules UI Bootstrap Instructions -- v2

This document records the exact prompt instructions configured in the Jules UI for each stage of the Nightly pipeline. All stage prompts in this version reference the shared base instructions file rather than duplicating them.

---

## [MANDATORY] Step 0: Load Shared Base Instructions

**Before reading your stage-specific prompt file, you MUST first read the file `.github/nightly-prompts-v2/00-shared-base.md` in full.**

All 7 Base blocks in that file govern every stage unconditionally. They take precedence over any instruction in your stage-specific file. Do not skip this step. Do not proceed to your stage task until you have read and internalized the shared base.

---

## [Stage 1] Hardening - Runtime Integrity Auditor

- **Fetch from:** `Nightly`
- **PR Base:** `Nightly`
- **PR Draft:** `false`
- **Bootstrap Target:** `.github/nightly-prompts-v2/01-hardening.md`

### Termination Contract

This task has exactly two valid outcomes. Either you complete all work fully autonomously and open a non-draft Pull Request targeting Nightly, or you determine that completing the task requires human input. If human input is required, you must not pause or wait in the UI. Instead, immediately append a clean termination record to the stage log file `.github/nightly-logs/01-hardening-coverage.log` stating the blocker, commit this log update, open a Pull Request targeting Nightly, and then close the session cleanly. A task left open and waiting for review in Jules' own UI is a system failure.

### Bootstrap Execution

1. Read `.github/nightly-prompts-v2/00-shared-base.md` in full.
2. Read and execute the instructions in `.github/nightly-prompts-v2/01-hardening.md`.

---

## [Stage 2] Test Suite & Logic Verification

- **Fetch from:** `Nightly`
- **PR Base:** `Nightly`
- **PR Draft:** `false`
- **Bootstrap Target:** `.github/nightly-prompts-v2/02-verification.md`

### Termination Contract

This task has exactly two valid outcomes. Either you complete all work fully autonomously and open a non-draft Pull Request targeting Nightly, or you determine that completing the task requires human input. If human input is required, you must not pause or wait in the UI. Instead, immediately append a clean termination record to the stage log file `.github/nightly-logs/02-verification-coverage.log` stating the blocker, commit this log update, open a Pull Request targeting Nightly, and then close the session cleanly. A task left open and waiting for review in Jules' own UI is a system failure.

### Bootstrap Execution

1. Read `.github/nightly-prompts-v2/00-shared-base.md` in full.
2. Read and execute the instructions in `.github/nightly-prompts-v2/02-verification.md`.

---

## [Stage 3] Database Schema & Migration Baselining

- **Fetch from:** `Nightly`
- **PR Base:** `Nightly`
- **PR Draft:** `false`
- **Bootstrap Target:** `.github/nightly-prompts-v2/03-baseline-consolidation.md`

### Termination Contract

This task has exactly two valid outcomes. Either you complete all work fully autonomously and open a non-draft Pull Request targeting Nightly, or you determine that completing the task requires human input. If human input is required, you must not pause or wait in the UI. Instead, immediately append a clean termination record to the stage log file `.github/nightly-logs/03-baseline-consolidation-coverage.log` stating the blocker, commit this log update, open a Pull Request targeting Nightly, and then close the session cleanly. A task left open and waiting for review in Jules' own UI is a system failure.

### Bootstrap Execution

1. Read `.github/nightly-prompts-v2/00-shared-base.md` in full.
2. Read and execute the instructions in `.github/nightly-prompts-v2/03-baseline-consolidation.md`.

---

## [Stage 4] Performance & Hygiene Optimizer

- **Fetch from:** `Nightly`
- **PR Base:** `Nightly`
- **PR Draft:** `false`
- **Bootstrap Target:** `.github/nightly-prompts-v2/04-optimization.md`

### Termination Contract

This task has exactly two valid outcomes. Either you complete all work fully autonomously and open a non-draft Pull Request targeting Nightly, or you determine that completing the task requires human input. If human input is required, you must not pause or wait in the UI. Instead, immediately append a clean termination record to the stage log file `.github/nightly-logs/04-optimization-coverage.log` stating the blocker, commit this log update, open a Pull Request targeting Nightly, and then close the session cleanly. A task left open and waiting for review in Jules' own UI is a system failure.

### Bootstrap Execution

1. Read `.github/nightly-prompts-v2/00-shared-base.md` in full.
2. Read and execute the instructions in `.github/nightly-prompts-v2/04-optimization.md`.

---

## [Stage 5] Document-README Integration

- **Fetch from:** `Nightly`
- **PR Base:** `Nightly`
- **PR Draft:** `false`
- **Bootstrap Target:** `.github/nightly-prompts-v2/05-documentation-readme.md`

### Termination Contract

This task has exactly two valid outcomes. Either you complete all work fully autonomously and open a non-draft Pull Request targeting Nightly, or you determine that completing the task requires human input. If human input is required, you must not pause or wait in the UI. Instead, immediately append a clean termination record to the stage log file `.github/nightly-logs/05-documentation-readme-coverage.log` stating the blocker, commit this log update, open a Pull Request targeting Nightly, and then close the session cleanly. A task left open and waiting for review in Jules' own UI is a system failure.

### Bootstrap Execution

1. Read `.github/nightly-prompts-v2/00-shared-base.md` in full.
2. Read and execute the instructions in `.github/nightly-prompts-v2/05-documentation-readme.md`.

---

## [Stage 6] Documentation TSDoc - Interface Contract Architect

- **Fetch from:** `Nightly`
- **PR Base:** `Nightly`
- **PR Draft:** `false`
- **Bootstrap Target:** `.github/nightly-prompts-v2/06-documentation-tsdoc.md`

### Termination Contract

This task has exactly two valid outcomes. Either you complete all work fully autonomously and open a non-draft Pull Request targeting Nightly, or you determine that completing the task requires human input. If human input is required, you must not pause or wait in the UI. Instead, immediately append a clean termination record to the stage log file `.github/nightly-logs/06-documentation-tsdoc-coverage.log` stating the blocker, commit this log update, open a Pull Request targeting Nightly, and then close the session cleanly. A task left open and waiting for review in Jules' own UI is a system failure.

### Bootstrap Execution

1. Read `.github/nightly-prompts-v2/00-shared-base.md` in full.
2. Read and execute the instructions in `.github/nightly-prompts-v2/06-documentation-tsdoc.md`.

---

## [Stage 7] Version Integrity - Version Consistency Auditor

- **Fetch from:** `Nightly`
- **PR Base:** `Nightly`
- **PR Draft:** `false`
- **Bootstrap Target:** `.github/nightly-prompts-v2/07-version-integrity.md`

### Termination Contract

This task has exactly two valid outcomes. Either you complete all work fully autonomously and open a non-draft Pull Request targeting Nightly, or you determine that completing the task requires human input. If human input is required, you must not pause or wait in the UI. Instead, immediately append a clean termination record to the stage log file `.github/nightly-logs/07-version-integrity-coverage.log` stating the blocker, commit this log update, open a Pull Request targeting Nightly, and then close the session cleanly. A task left open and waiting for review in Jules' own UI is a system failure.

### Bootstrap Execution

1. Read `.github/nightly-prompts-v2/00-shared-base.md` in full.
2. Read and execute the instructions in `.github/nightly-prompts-v2/07-version-integrity.md`.

---

## [Stage 8] Dependency Audit - External Health Auditor

- **Fetch from:** `Nightly`
- **PR Base:** `Nightly`
- **PR Draft:** `false`
- **Bootstrap Target:** `.github/nightly-prompts-v2/08-dependency-audit.md`

### Termination Contract

This task has exactly two valid outcomes. Either you complete all work fully autonomously and open a non-draft Pull Request targeting Nightly, or you determine that completing the task requires human input. If human input is required, you must not pause or wait in the UI. Instead, immediately append a clean termination record to the stage log file `.github/nightly-logs/08-dependency-audit-coverage.log` stating the blocker, commit this log update, open a Pull Request targeting Nightly, and then close the session cleanly. A task left open and waiting for review in Jules' own UI is a system failure.

### Bootstrap Execution

1. Read `.github/nightly-prompts-v2/00-shared-base.md` in full.
2. Read and execute the instructions in `.github/nightly-prompts-v2/08-dependency-audit.md`.

---

## [Stage 9] Refactor - Structural Surgery Engineer

- **Fetch from:** `Nightly`
- **PR Base:** `Nightly`
- **PR Draft:** `false`
- **Bootstrap Target:** `.github/nightly-prompts-v2/09-refactor-proposals.md`

### Termination Contract

This task has exactly two valid outcomes. Either you complete all work fully autonomously and open a non-draft Pull Request targeting Nightly, or you determine that completing the task requires human input. If human input is required, you must not pause or wait in the UI. Instead, immediately append a clean termination record to the stage log file `.github/nightly-logs/09-refactor-proposals-coverage.log` stating the blocker, commit this log update, open a Pull Request targeting Nightly, and then close the session cleanly. A task left open and waiting for review in Jules' own UI is a system failure.

### Bootstrap Execution

1. Read `.github/nightly-prompts-v2/00-shared-base.md` in full.
2. Read and execute the instructions in `.github/nightly-prompts-v2/09-refactor-proposals.md`.

---

## [Stage 10] APK & PWA Wrapper Integrity Auditor

- **Fetch from:** `Nightly`
- **PR Base:** `Nightly`
- **PR Draft:** `false`
- **Bootstrap Target:** `.github/nightly-prompts-v2/10-apk-integrity.md`

### Termination Contract

This task has exactly two valid outcomes. Either you complete all work fully autonomously and open a non-draft Pull Request targeting Nightly, or you determine that completing the task requires human input. If human input is required, you must not pause or wait in the UI. Instead, immediately append a clean termination record to the stage log file `.github/nightly-logs/10-apk-integrity-coverage.log` stating the blocker, commit this log update, open a Pull Request targeting Nightly, and then close the session cleanly. A task left open and waiting for review in Jules' own UI is a system failure.

### Bootstrap Execution

1. Read `.github/nightly-prompts-v2/00-shared-base.md` in full.
2. Read and execute the instructions in `.github/nightly-prompts-v2/10-apk-integrity.md`.

---

## [Stage 11] APK & Native Wrapper Optimizations

- **Fetch from:** `Nightly`
- **PR Base:** `Nightly`
- **PR Draft:** `false`
- **Bootstrap Target:** `.github/nightly-prompts-v2/11-apk-optimization.md`

### Termination Contract

This task has exactly two valid outcomes. Either you complete all work fully autonomously and open a non-draft Pull Request targeting Nightly, or you determine that completing the task requires human input. If human input is required, you must not pause or wait in the UI. Instead, immediately append a clean termination record to the stage log file `.github/nightly-logs/11-apk-optimization-coverage.log` stating the blocker, commit this log update, open a Pull Request targeting Nightly, and then close the session cleanly. A task left open and waiting for review in Jules' own UI is a system failure.

### Bootstrap Execution

1. Read `.github/nightly-prompts-v2/00-shared-base.md` in full.
2. Read and execute the instructions in `.github/nightly-prompts-v2/11-apk-optimization.md`.

---

## [Stage 12] Hybrid Shell UX & UI Auditor

- **Fetch from:** `Nightly`
- **PR Base:** `Nightly`
- **PR Draft:** `false`
- **Bootstrap Target:** `.github/nightly-prompts-v2/12-apk-ux.md`

### Termination Contract

This task has exactly two valid outcomes. Either you complete all work fully autonomously and open a non-draft Pull Request targeting Nightly, or you determine that completing the task requires human input. If human input is required, you must not pause or wait in the UI. Instead, immediately append a clean termination record to the stage log file `.github/nightly-logs/12-apk-ux-coverage.log` stating the blocker, commit this log update, open a Pull Request targeting Nightly, and then close the session cleanly. A task left open and waiting for review in Jules' own UI is a system failure.

### Bootstrap Execution

1. Read `.github/nightly-prompts-v2/00-shared-base.md` in full.
2. Read and execute the instructions in `.github/nightly-prompts-v2/12-apk-ux.md`.

---

## [Stage 13] Self-Healing Protocol

- **Fetch from:** `Nightly`
- **PR Base:** `Nightly`
- **PR Draft:** `false`
- **Bootstrap Target:** `.github/nightly-prompts-v2/13-self-healing-protocol.md`

### Termination Contract

This task has exactly two valid outcomes. Either you complete all work fully autonomously and open a non-draft Pull Request targeting Nightly, or you determine that completing the task requires human input. If human input is required, you must not pause or wait in the UI. Instead, immediately append a clean termination record to the stage log file `.github/nightly-logs/13-self-healing-protocol-coverage.log` stating the blocker, commit this log update, open a Pull Request targeting Nightly, and then close the session cleanly. A task left open and waiting for review in Jules' own UI is a system failure.

### Bootstrap Execution

1. Read `.github/nightly-prompts-v2/00-shared-base.md` in full.
2. Read and execute the instructions in `.github/nightly-prompts-v2/13-self-healing-protocol.md`.
