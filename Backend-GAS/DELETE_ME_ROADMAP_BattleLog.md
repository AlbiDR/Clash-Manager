---
description: Roadmap for decoupling and integrating the BattleLog Service
---

# Roadmap: BattleLog Service Architecture

This plan outlines the extraction of the extraction engine into a dedicated service and its integration into the core pipelines.

## Phase 1: Modularization (The Extraction)

- [ ] **Create `Service_BattleLog.ts`**:
    - Move the `BattleLogProcessor` class and `AnalysisGoal` enum from the debugger file to this new permanent home.
    - Ensure it exports these artifacts cleanly for other modules.

- [ ] **Update `Utility_Battlelog_Debugger.ts`**:
    - Delete the local class definition.
    - Import `BattleLogProcessor` from `Service_BattleLog`.
    - Verify the "Lab" still works identical to before (Regression Test).

## Phase 2: Integration (The Headhunter)

- [ ] **Update `Headhunter_Scanner.ts`**:
    - Import `BattleLogProcessor` and `AnalysisGoal`.
    - Locate the "Shadow Scout" logic block (Lines ~240-300).
    - **DELETE** the manual battlelog fetching and nested looping.
    - **REPLACE** with a specific call:
      ```typescript
      const recruits = BattleLogProcessor.digest(seedTag, AnalysisGoal.RECRUITMENT);
      ```
    - Map the result back to the `Recruit` interface expected by the Scanner.

## Phase 3: Cleanup & Optimization

- [ ] **Dependency Check**: Ensure `Registry` and `CONFIG` imports in the new service are circular-dependency free.
- [ ] **Verification**: Run `scout()` to confirm the new engine is feeding the pipeline correctly.
