// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# shared/utils

> Presentation helpers that sit between raw domain data and the UI: too UI-specific for [`@core/utils`](../../core/utils/README.md), too general for one feature.

**Layer 2 (@shared)** | may import `@core` | never imports `@features` or `@app`.

## Contents

| File | Role |
| :--- | :--- |
| `game.ts` | Normalizes raw role strings (e.g. `coleader`) into display labels and their CSS classes (`role-leader`, `role-elder`). Exposed as `formatRole` through the `@shared` barrel. |

## Conventions

- Concerned with how things look, not what they mean (that belongs in `@core/utils`).
- Pure and stateless; anything reactive belongs in [`@shared/composables`](../composables/README.md).

## See also

- [Frontend README](../../../README.md) | [`@shared`](../README.md)
- [`@core/utils`](../../core/utils/README.md) - the sibling this directory deliberately differs from: `@core/utils` holds game logic and pure data utilities; `@shared/utils` holds presentation helpers that are too UI-specific for `@core`
