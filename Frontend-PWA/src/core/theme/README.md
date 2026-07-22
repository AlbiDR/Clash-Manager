// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# core/theme

> The design-token engine and the generated app shell: it turns TypeScript tokens into CSS variables and produces the critical CSS and HTML the app boots with.

**Layer 1 (@core)** | imports nothing above it.

## Responsibilities

- Define the light and dark design tokens and generate the `--sys-*` CSS variables from them.
- Generate the app-shell CSS and HTML that render before Vue hydrates, for a fast, stable first paint.
- Hold every SVG icon path used by the app.

## Contents

| File | Role |
| :--- | :--- |
| `tokens.ts` | The design tokens (light/dark) and the CSS-variable generator. |
| `base.ts` | Global reset, typography, spacing, shape, and z-index tokens; gesture overrides. |
| `HtmlEntry.ts` | The TypeScript source for the HTML entry point, injected at build time. |
| `AppShell.ts` | Generates the critical CSS (`getAppShellStyles`) and the shell HTML (`getAppShellHtml`). |
| `skeletons.ts` | The shell loading skeletons. |
| `animations.ts` | Shared CSS keyframes. |
| `icons.ts` | All SVG paths, consumed only by `Icon.vue`. |

## Gotchas

- **Hydration parity:** if you change the layout of `App.vue` or `ConsoleLayout`, update `AppShell.ts` to match, or the first paint will shift when Vue takes over.
- The engine is stateless. Runtime theme switching lives in [`useTheme`](../../shared/composables/README.md); this directory only defines the system.

## See also

- [`@core`](../README.md) | [DESIGN.md](../../../../DESIGN.md)
