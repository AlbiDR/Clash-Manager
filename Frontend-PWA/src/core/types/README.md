// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# core/types

> The shared TypeScript contracts every layer agrees on, kept in one place so data crossing boundaries never drifts.

**Layer 1 (@core)** | imports nothing above it.

## What it defines

- **`AndroidBridge`** - the interface the PWA uses to talk to the Android wrapper's native layer: deep links (`openPlayerProfile`), external intents (`openExternalUrl`), accessibility status, and Blitz calibration coordinates.
- **Domain models** - `LeaderboardMember` (with `performanceScore` / `performanceRawScore`), `Recruit` (with `potentialScore`, longevity, heritage), and `WebAppData` (the full roster + recruit snapshot).
- **UI contracts** - `ConsoleFabState`, `ConsoleLayoutEvents`, and `ConsoleCardMetadata` for the shared list components.
- **Clan Voyage** - `VoyageStatus` (IDLE, PENDING, ACTIVE, COMPLETED) and `VoyageSummary`, kept here so features stay isolated.

## Gotchas

- The `AndroidBridge` methods are implemented in the compiled release APK (Java native layer). Renaming or changing a signature here without a matching native update breaks the hardware features. Treat it as a hard cross-boundary contract.

## See also

- [`@core`](../README.md) | [APK native bridge](../../../../APK/README.md)
