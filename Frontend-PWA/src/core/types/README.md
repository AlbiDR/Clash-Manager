// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# core/types

> The shared TypeScript contracts every layer agrees on, kept in one place so data crossing boundaries never drifts.

**Layer 1 (@core)** | imports nothing above it.

## What it defines

- **`AndroidBridge`** - the interface the [PWA](../../../README.md) uses to talk to the [Android wrapper](../../../../APK/README.md)'s native layer: deep links (`openPlayerProfile`), external intents (`openExternalUrl`), native APK version/build metadata, accessibility status, and Blitz calibration coordinates.
- **Domain models** - `LeaderboardMember` (with `performanceScore` / `performanceRawScore`, the [Roster](../../features/roster/README.md)'s core model), `Recruit` (with `potentialScore`, longevity, heritage, the [Headhunter](../../features/headhunter/README.md)'s core model), and `WebAppData` (the full roster + recruit snapshot).
- **UI contracts** - `ConsoleFabState`, `ConsoleLayoutEvents`, and `ConsoleCardMetadata` for the shared list components.
- **Clan Voyage** - `VoyageStatus` (IDLE, PENDING, ACTIVE, COMPLETED) and `VoyageSummary`, kept here so features stay isolated.

## Gotchas

- The `AndroidBridge` methods are implemented in the compiled [release APK](../../../../APK/README.md) (Java native layer). Renaming or changing a signature here without a matching native update breaks the hardware features. Treat it as a hard cross-boundary contract.

## See also

- [Frontend README](../../../README.md) | [`@core`](../README.md) | [APK native bridge](../../../../APK/README.md)
- [`@core/api`](../api/README.md) - the mappers and schemas here consume `LeaderboardMember`, `Recruit`, and `WebAppData`
- Feature consumers: [`@features/roster`](../../features/roster/README.md) - `LeaderboardMember` (with `performanceScore`) is the Roster's core data model | [`@features/headhunter`](../../features/headhunter/README.md) - `Recruit` (with `potentialScore`) is the Headhunter's core data model
