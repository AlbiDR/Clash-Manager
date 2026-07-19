// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# Jules UI Bootstrap Instructions

This document records the exact prompt instructions configured in the Jules UI for each stage of the Nightly pipeline.

---

## [Stage 1] Hardening - Runtime Integrity Auditor

- **Fetch from:** `Nightly`
- **PR Base:** `Nightly`
- **PR Draft:** `false`
- **Bootstrap Target:** [.github/nightly-prompts/01-hardening.md](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-prompts/01-hardening.md)

### Termination Contract

This task has exactly two valid outcomes. Either you complete all work fully autonomously and open a non-draft Pull Request targeting Nightly, or you determine that completing the task requires human input. If human input is required, you must not pause or wait in the UI. Instead, immediately append a clean termination record to the stage log file [.github/nightly-logs/01-hardening-coverage.log](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-logs/01-hardening-coverage.log) stating the blocker, commit this log update, open a Pull Request targeting Nightly, and then close the session cleanly. A task left open and waiting for review in Jules' own UI is a system failure.

### Bootstrap Execution

Read and execute the instructions in this file exactly as written: `.github/nightly-prompts/01-hardening.md`

---

## [Stage 2] Test Suite & Logic Verification

- **Fetch from:** `Nightly`
- **PR Base:** `Nightly`
- **PR Draft:** `false`
- **Bootstrap Target:** [.github/nightly-prompts/02-verification.md](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-prompts/02-verification.md)

### Termination Contract

This task has exactly two valid outcomes. Either you complete all work fully autonomously and open a non-draft Pull Request targeting Nightly, or you determine that completing the task requires human input. If human input is required, you must not pause or wait in the UI. Instead, immediately append a clean termination record to the stage log file [.github/nightly-logs/02-verification-coverage.log](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-logs/02-verification-coverage.log) stating the blocker, commit this log update, open a Pull Request targeting Nightly, and then close the session cleanly. A task left open and waiting for review in Jules' own UI is a system failure.

### Bootstrap Execution

Read and execute the instructions in this file exactly as written: `.github/nightly-prompts/02-verification.md`

---

## [Stage 3] Database Schema & Migration Baselining

- **Fetch from:** `Nightly`
- **PR Base:** `Nightly`
- **PR Draft:** `false`
- **Bootstrap Target:** [.github/nightly-prompts/03-baseline-consolidation.md](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-prompts/03-baseline-consolidation.md)

### Termination Contract

This task has exactly two valid outcomes. Either you complete all work fully autonomously and open a non-draft Pull Request targeting Nightly, or you determine that completing the task requires human input. If human input is required, you must not pause or wait in the UI. Instead, immediately append a clean termination record to the stage log file [.github/nightly-logs/03-baseline-consolidation-coverage.log](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-logs/03-baseline-consolidation-coverage.log) stating the blocker, commit this log update, open a Pull Request targeting Nightly, and then close the session cleanly. A task left open and waiting for review in Jules' own UI is a system failure.

### Bootstrap Execution

Read and execute the instructions in this file exactly as written: `.github/nightly-prompts/03-baseline-consolidation.md`

---

## [Stage 4] Performance & Hygiene Optimizer

- **Fetch from:** `Nightly`
- **PR Base:** `Nightly`
- **PR Draft:** `false`
- **Bootstrap Target:** [.github/nightly-prompts/04-optimization.md](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-prompts/04-optimization.md)

### Termination Contract

This task has exactly two valid outcomes. Either you complete all work fully autonomously and open a non-draft Pull Request targeting Nightly, or you determine that completing the task requires human input. If human input is required, you must not pause or wait in the UI. Instead, immediately append a clean termination record to the stage log file [.github/nightly-logs/04-optimization-coverage.log](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-logs/04-optimization-coverage.log) stating the blocker, commit this log update, open a Pull Request targeting Nightly, and then close the session cleanly. A task left open and waiting for review in Jules' own UI is a system failure.

### Bootstrap Execution

Read and execute the instructions in this file exactly as written: `.github/nightly-prompts/04-optimization.md`

---

## [Stage 5] Document-README Integration

- **Fetch from:** `Nightly`
- **PR Base:** `Nightly`
- **PR Draft:** `false`
- **Bootstrap Target:** [.github/nightly-prompts/05-documentation-readme.md](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-prompts/05-documentation-readme.md)

### Termination Contract

This task has exactly two valid outcomes. Either you complete all work fully autonomously and open a non-draft Pull Request targeting Nightly, or you determine that completing the task requires human input. If human input is required, you must not pause or wait in the UI. Instead, immediately append a clean termination record to the stage log file [.github/nightly-logs/05-documentation-readme-coverage.log](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-logs/05-documentation-readme-coverage.log) stating the blocker, commit this log update, open a Pull Request targeting Nightly, and then close the session cleanly. A task left open and waiting for review in Jules' own UI is a system failure.

### Bootstrap Execution

Read and execute the instructions in this file exactly as written: `.github/nightly-prompts/05-documentation-readme.md`

---

## [Stage 6] Documentation TSDoc - Interface Contract Architect

- **Fetch from:** `Nightly`
- **PR Base:** `Nightly`
- **PR Draft:** `false`
- **Bootstrap Target:** [.github/nightly-prompts/06-documentation-tsdoc.md](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-prompts/06-documentation-tsdoc.md)

### Termination Contract

This task has exactly two valid outcomes. Either you complete all work fully autonomously and open a non-draft Pull Request targeting Nightly, or you determine that completing the task requires human input. If human input is required, you must not pause or wait in the UI. Instead, immediately append a clean termination record to the stage log file [.github/nightly-logs/06-documentation-tsdoc-coverage.log](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-logs/06-documentation-tsdoc-coverage.log) stating the blocker, commit this log update, open a Pull Request targeting Nightly, and then close the session cleanly. A task left open and waiting for review in Jules' own UI is a system failure.

### Bootstrap Execution

Read and execute the instructions in this file exactly as written: `.github/nightly-prompts/06-documentation-tsdoc.md`

---

## [Stage 7] Version Integrity - Version Consistency Auditor

- **Fetch from:** `Nightly`
- **PR Base:** `Nightly`
- **PR Draft:** `false`
- **Bootstrap Target:** [.github/nightly-prompts/07-version-integrity.md](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-prompts/07-version-integrity.md)

### Termination Contract

This task has exactly two valid outcomes. Either you complete all work fully autonomously and open a non-draft Pull Request targeting Nightly, or you determine that completing the task requires human input. If human input is required, you must not pause or wait in the UI. Instead, immediately append a clean termination record to the stage log file [.github/nightly-logs/07-version-integrity-coverage.log](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-logs/07-version-integrity-coverage.log) stating the blocker, commit this log update, open a Pull Request targeting Nightly, and then close the session cleanly. A task left open and waiting for review in Jules' own UI is a system failure.

### Bootstrap Execution

Read and execute the instructions in this file exactly as written: `.github/nightly-prompts/07-version-integrity.md`

---

## [Stage 8] Dependency Audit - External Health Auditor

- **Fetch from:** `Nightly`
- **PR Base:** `Nightly`
- **PR Draft:** `false`
- **Bootstrap Target:** [.github/nightly-prompts/08-dependency-audit.md](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-prompts/08-dependency-audit.md)

### Termination Contract

This task has exactly two valid outcomes. Either you complete all work fully autonomously and open a non-draft Pull Request targeting Nightly, or you determine that completing the task requires human input. If human input is required, you must not pause or wait in the UI. Instead, immediately append a clean termination record to the stage log file [.github/nightly-logs/08-dependency-audit-coverage.log](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-logs/08-dependency-audit-coverage.log) stating the blocker, commit this log update, open a Pull Request targeting Nightly, and then close the session cleanly. A task left open and waiting for review in Jules' own UI is a system failure.

### Bootstrap Execution

Read and execute the instructions in this file exactly as written: `.github/nightly-prompts/08-dependency-audit.md`

---

## [Stage 9] Refactor - Structural Surgery Engineer

- **Fetch from:** `Nightly`
- **PR Base:** `Nightly`
- **PR Draft:** `false`
- **Bootstrap Target:** [.github/nightly-prompts/09-refactor-proposals.md](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-prompts/09-refactor-proposals.md)

### Termination Contract

This task has exactly two valid outcomes. Either you complete all work fully autonomously and open a non-draft Pull Request targeting Nightly, or you determine that completing the task requires human input. If human input is required, you must not pause or wait in the UI. Instead, immediately append a clean termination record to the stage log file [.github/nightly-logs/09-refactor-proposals-coverage.log](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-logs/09-refactor-proposals-coverage.log) stating the blocker, commit this log update, open a Pull Request targeting Nightly, and then close the session cleanly. A task left open and waiting for review in Jules' own UI is a system failure.

### Bootstrap Execution

Read and execute the instructions in this file exactly as written: `.github/nightly-prompts/09-refactor-proposals.md`

---

## [Stage 10] APK & PWA Wrapper Integrity Auditor

- **Fetch from:** `Nightly`
- **PR Base:** `Nightly`
- **PR Draft:** `false`
- **Bootstrap Target:** [.github/nightly-prompts/10-apk-integrity.md](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-prompts/10-apk-integrity.md)

### Termination Contract

This task has exactly two valid outcomes. Either you complete all work fully autonomously and open a non-draft Pull Request targeting Nightly, or you determine that completing the task requires human input. If human input is required, you must not pause or wait in the UI. Instead, immediately append a clean termination record to the stage log file [.github/nightly-logs/10-apk-integrity-coverage.log](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-logs/10-apk-integrity-coverage.log) stating the blocker, commit this log update, open a Pull Request targeting Nightly, and then close the session cleanly. A task left open and waiting for review in Jules' own UI is a system failure.

### Bootstrap Execution

Read and execute the instructions in this file exactly as written: `.github/nightly-prompts/10-apk-integrity.md`

---

## [Stage 11] APK & Native Wrapper Optimizations

- **Fetch from:** `Nightly`
- **PR Base:** `Nightly`
- **PR Draft:** `false`
- **Bootstrap Target:** [.github/nightly-prompts/11-apk-optimization.md](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-prompts/11-apk-optimization.md)

### Termination Contract

This task has exactly two valid outcomes. Either you complete all work fully autonomously and open a non-draft Pull Request targeting Nightly, or you determine that completing the task requires human input. If human input is required, you must not pause or wait in the UI. Instead, immediately append a clean termination record to the stage log file [.github/nightly-logs/11-apk-optimization-coverage.log](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-logs/11-apk-optimization-coverage.log) stating the blocker, commit this log update, open a Pull Request targeting Nightly, and then close the session cleanly. A task left open and waiting for review in Jules' own UI is a system failure.

### Bootstrap Execution

Read and execute the instructions in this file exactly as written: `.github/nightly-prompts/11-apk-optimization.md`

---

## [Stage 12] Hybrid Shell UX & UI Auditor

- **Fetch from:** `Nightly`
- **PR Base:** `Nightly`
- **PR Draft:** `false`
- **Bootstrap Target:** [.github/nightly-prompts/12-apk-ux.md](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-prompts/12-apk-ux.md)

### Termination Contract

This task has exactly two valid outcomes. Either you complete all work fully autonomously and open a non-draft Pull Request targeting Nightly, or you determine that completing the task requires human input. If human input is required, you must not pause or wait in the UI. Instead, immediately append a clean termination record to the stage log file [.github/nightly-logs/12-apk-ux-coverage.log](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-logs/12-apk-ux-coverage.log) stating the blocker, commit this log update, open a Pull Request targeting Nightly, and then close the session cleanly. A task left open and waiting for review in Jules' own UI is a system failure.

### Bootstrap Execution

Read and execute the instructions in this file exactly as written: `.github/nightly-prompts/12-apk-ux.md`

---

## [Stage 13] Self-Healing Protocol

- **Fetch from:** `Nightly`
- **PR Base:** `Nightly`
- **PR Draft:** `false`
- **Bootstrap Target:** [.github/nightly-prompts/13-self-healing-protocol.md](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-prompts/13-self-healing-protocol.md)

### Termination Contract

This task has exactly two valid outcomes. Either you complete all work fully autonomously and open a non-draft Pull Request targeting Nightly, or you determine that completing the task requires human input. If human input is required, you must not pause or wait in the UI. Instead, immediately append a clean termination record to the stage log file [.github/nightly-logs/13-self-healing-protocol-coverage.log](file:///Users/ADR/Documents/Github/Projects/clash-manager/.github/nightly-logs/13-self-healing-protocol-coverage.log) stating the blocker, commit this log update, open a Pull Request targeting Nightly, and then close the session cleanly. A task left open and waiting for review in Jules' own UI is a system failure.

### Bootstrap Execution

Read and execute the instructions in this file exactly as written: `.github/nightly-prompts/13-self-healing-protocol.md`
