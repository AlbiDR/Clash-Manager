// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# core/config

> One file, `index.ts`, holding every tunable constant and identifier so nothing meaningful is hard-coded elsewhere.

**Layer 1 (@core)** | may be imported by any layer.

## What it holds

- **Thresholds and defaults** - data staleness TTL, the default recruit-score threshold, the default Voyage crown target, and the score-selection steps.
- **Timing constants** - UI stability delay, Blitz safety window, badge-update debounce, and storage timeouts.
- **Storage identifiers** - the current IndexedDB name (`clash_manager_v14`), the registry of deprecated database names to prune, and the recruit notification tag shared with the service worker.

## Conventions

- The only literals allowed elsewhere are mathematical identities (`0`, `1`, `100`). Every business number lives here as a named export.
- Timing and storage values are also referenced by the service worker and the Android bridge, so changing one means changing all consumers. Refer to constants by name; do not restate their values in other docs.

## See also

- [`@core`](../README.md)
