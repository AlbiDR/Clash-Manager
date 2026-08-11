// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# shared/directives

> Vue directives and adjacent state orchestrators that attach consistent interaction feedback and overlay systems to DOM elements.

**Layer 2 (@shared)** | may import `@core` | never imports `@features` or `@app`. Directives are registered globally at startup.

## Contents

| File | Type | Role |
| :--- | :--- | :--- |
| `vTactile.ts` | Directive | Tap and long-press haptics. Ignores actionable children (`.btn-action`, `a`, `.hit-target`) to avoid nested triggers. 500ms long-press threshold, 10px DPI-aware movement tolerance. |
| `vTooltip.ts` | Directive | An accessible rich tooltip built on the native Popover API, rendered from a single reused instance on `document.body`. 400ms touch long-press to open, hides on scroll. |
| `ghostBenchmarkState.ts` | State Manager | Global reactive module-level singleton state (`useGhostBenchmarkState`) that bridges interactions detected by `v-tooltip` and overlays managed by `GhostBenchmarkHost`. |

## Gotchas

- Both directives guard for a missing `window` so they are safe in non-browser environments.
- `ghostBenchmarkState.ts` acts as a pure reactive bridge between Layer 2 directives (`v-tooltip`) and Layer 2 presentation hosts (`GhostBenchmarkHost`), using a module-level reactive singleton rather than an external store.
- Keep directives restricted to DOM interactions and sensory feedback only; complex business logic belongs in [composables](../composables/README.md) or [services](../../core/services/README.md).

## See also

- [Frontend README](../../../README.md) | [`@shared`](../README.md) | [`useHaptics`](../composables/README.md)
