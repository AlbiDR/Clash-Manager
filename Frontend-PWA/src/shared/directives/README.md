// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# shared/directives

> Two Vue directives that attach consistent interaction feedback to any element.

**Layer 2 (@shared)** | may import `@core` | never imports `@features` or `@app`. Registered globally at startup.

## Contents

| Directive | Role |
| :--- | :--- |
| `vTactile.ts` | Tap and long-press haptics. Ignores actionable children (`.btn-action`, `a`, `.hit-target`) to avoid nested triggers. 500ms long-press threshold, 10px DPI-aware movement tolerance. |
| `vTooltip.ts` | An accessible rich tooltip built on the native Popover API, rendered from a single reused instance on `document.body`. 400ms touch long-press to open, hides on scroll. |

## Gotchas

- Both guard for a missing `window` so they are safe in non-browser environments.
- Keep directives to DOM and feedback only; business logic belongs in composables or services.

## See also

- [`@shared`](../README.md) | [`useHaptics`](../composables/README.md)
