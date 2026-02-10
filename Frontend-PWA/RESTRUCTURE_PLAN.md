# Architecture Restructure Plan

This document outlines the migration plan to a Feature-First Architecture.

## Directory Structure

### `src/core`
**Purpose**: The "Kernel". Pure, app-agnostic foundations.
- `api/`: Base API clients (e.g., `GasClient`).
- `theme/`: Global styles, CSS variables, tokens.
- `types/`: Global TypeScript definitions.
- `utils/`: Generic helpers (math, formatting, dates).

### `src/shared`
**Purpose**: "The Building Blocks". Reused across features.
- `ui/`: Atomic Components (Icon, Button, Card, Toast).
- `composables/`: Generic logic (useHaptics, useWakeLock, useStorage).

### `src/features`
**Purpose**: "The Business". Domain-specific silos.

#### `laboratory`
- `components/`: UI specific to the Laboratory (UpgradeCard).
- `logic/`: Pure business logic (Optimizer Kernel).
- `composables/`: State management (useLaboratory).
- `views/`: Route components (LaboratoryView).

#### `headhunter`
- `components/`: UI specific to Headhunter.
- `composables/`: State management (useHeadhunter).
- `views/`: Route components (RecruiterView).

#### `roster`
- `components/`: UI specific to Roster management.
- `composables/`: State management (useClashData? - TBD).
- `views/`: (e.g., HomeView).

#### `settings`
- `components/`: Settings UI.
- `composables/`: useSettings.

### `src/app`
**Purpose**: "The Glue". App-level orchestration.
- `router/`: Route definitions.
- `layouts/`: Global layouts (ConsoleLayout).
- `App.vue`: Root component.
- `main.ts`: Entry point.

## Migration Checklist

### Phase 1: Infrastructure (Done)
- [x] Create directory structure.
- [x] Configure aliases in `tsconfig.app.json`.
- [x] Configure aliases in `vite.config.ts`.

### Phase 2: Core & Shared (Next)
- [ ] Move `src/utils` -> `src/core/utils`.
- [ ] Move `src/types` -> `src/core/types`.
- [ ] Move `src/api` -> `src/core/api`.
- [ ] Move atomic UI components (Icon, StatusPill) -> `src/shared/ui`.
- [ ] Move generic composables (useHaptics, useStorage) -> `src/shared/composables`.

### Phase 3: Features
- [ ] Move Laboratory logic/components -> `src/features/laboratory`.
- [ ] Move Headhunter logic/components -> `src/features/headhunter`.
- [ ] Move Settings logic/components -> `src/features/settings`.

### Phase 4: App Glue
- [ ] Move `router/` -> `src/app/router`.
- [ ] Move `App.vue`, `main.ts` -> `src/app`.
- [ ] Update all imports.
- [ ] Fix tests.

## Rules of Engagement
1. **No Circular Dependencies**: Core cannot import Features. Features cannot import other Features (use shared state or events if needed).
2. **Strict Encapsulation**: If a component is only used in one feature, it stays in that feature.
3. **DRY via Shared**: If a component is needed by two features, move it to `src/shared/ui`.
