# Implementation Plan - Workflow Sync & Build Fix

## Problem Statement

The current branch synchronization workflow merges changes across branches but doesn't trigger downstream deployments if the `Stable` branch is updated. Additionally, a recent change introduced a syntax error in `useClanData.ts` which prevents the PWA from building.

## Proposed Changes

### 1. GitHub Workflows

- **`sync-branches.yml`**:
  - Add `actions: write` permission to allow triggering other workflows.
  - Implement change detection for `Frontend-PWA/` and `Backend-GAS/` folders during the merge to `Stable`.
  - Use `gh workflow run` to trigger `deploy-pwa.yml` or `deploy-gas.yml` if their respective paths were modified.
- **`deploy-pwa.yml`**:
  - Update job `if` conditions to include `github.event_name == 'workflow_dispatch'`.

### 2. Frontend Fixes

- **`useClanData.ts`**:
  - Remove redundant `});` at line 190 that was causing `ERROR: Expected "finally" but found ")"`.

## Verification Plan

### Local Verification

- Check file contents to ensure syntax is correct.
- Validate YAML structure of workflows.

### Automation Verification

- Once pushed, the `Sync Branches` workflow will be capable of triggering deployments.
- Build & Verify job in `deploy-pwa.yml` should now pass once the syntax error is gone.
