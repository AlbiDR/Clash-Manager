// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# core/config

> One file, `index.ts`, holding every tunable constant and identifier so nothing meaningful is hard-coded elsewhere.

**Layer 1 (@core)** | may be imported by any layer.

## What it holds

- **Thresholds and defaults** - data staleness TTL, the default recruit-score threshold, the default Voyage crown target, and the score-selection steps.
- **Timing constants** - UI stability delay, Blitz safety window, badge-update debounce, and storage timeouts.
- **Foreground polling interval** - `FOREGROUND_POLL_INTERVAL` (5 minutes) to periodically poll Supabase while the app remains open and foregrounded, eliminating unhandled session staleness.
- **Backend refresh cooldowns** - `BACKEND_REFRESH_COOLDOWN_SECONDS` (60) and `BACKEND_REFRESH_COOLDOWN_INTERVAL` (1000) for uniform, cooldown-guarded manual refresh operations.
- **Simulation safety limits** - `SIMULATION_MAX_ITERATIONS` (5000) to protect the laboratory's upgrade trajectory calculation from infinite loops.
- **Storage identifiers** - the current IndexedDB name (`clash_manager_v14`), the registry of deprecated database names to prune, and the recruit notification tag shared with the service worker.

## Conventions

- The only literals allowed elsewhere are mathematical identities (`0`, `1`, `100`). Every business number lives here as a named export.
- Timing and storage values are also referenced by the [service worker](../../app/README.md) and the [Android bridge](../../../../APK/README.md), so changing one means changing all consumers. Refer to constants by name; do not restate their values in other docs.

## See also

- [Frontend README](../../../README.md) | [`@core`](../README.md)
- [`@app`](../../app/README.md) - the service worker (`sw.ts`) uses the recruit notification tag constant exported here
- [APK](../../../../APK/README.md) - the Android bridge references the same Blitz timing and storage values; changing them here means updating native consumers too
