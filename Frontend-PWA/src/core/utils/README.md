// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# core/utils

> Pure, stateless engines: Clash Royale game math, formatting, sorting, the IndexedDB wrapper, and the data structures the simulator needs.

**Layer 1 (@core)** | may import other utils and `@substrate` | never imports services or higher layers.

## Contents

| File | Role |
| :--- | :--- |
| `game.ts`, `gameConstants.ts`, `gameTypes.ts` | Clash Royale card data, XP and King-level math, level normalization. Used by the Laboratory. |
| `economy.ts` | Currency math and branded `Gold` / `Gems` / `XP` types. |
| `PriorityQueue.ts` | A binary heap (O(log N)) for upgrade selection in the simulator. |
| `idbKernel.ts` | Low-level IndexedDB wrapper with in-memory fallback. |
| `math.ts` | Number formatting, momentum, and duration conversion; handles null/NaN safely. |
| `time.ts` | Relative-time and countdown formatting. |
| `text.ts` | Tag cleaning and display formatting, plus a small Markdown parser for clan descriptions. |
| `locale.ts` | Maps the browser language to a Supercell-supported locale for external links. |
| `assets.ts` | Resolves game-asset icon paths relative to the app base URL. |
| `sortOptions.ts`, `sortStrategies.ts` | Sort labels/descriptions and the comparator functions for Roster and Headhunter. |
| `bezier.ts` | Cubic-bezier math for smooth chart trend lines. |
| `navigation.ts` | The source of truth for the nav items and their icons. |
| `visibility.ts` | Registry for focus-based revalidation triggers. |
| `mockData.ts` | Synthetic payloads for the Synthetic display mode and tests. |

## Conventions

- Utilities stay pure and stateless. Anything needing reactive state or side effects belongs in a service or a shared composable.
- Import directly from a file, not through a barrel, to keep tree-shaking effective.

## See also

- [`@core`](../README.md)
