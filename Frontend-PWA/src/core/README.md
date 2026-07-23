// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# core

> Layer 1: the framework-agnostic foundation. Data transport, persistence, services, theme, types, and pure utilities that everything else builds on.

**Layer 1 (@core)** | imports nothing above it | imported by [`@shared`](../shared/README.md), [`@features`](../features/README.md), and [`@app`](../app/README.md).

## Responsibilities

- Talk to Supabase and validate everything that comes back.
- Persist and cache data locally, and orchestrate the stale-while-revalidate sync.
- Provide the services, theme tokens, types, and utility engines the rest of the app depends on.

## Subdirectories

Each subdirectory owns its own README; this file is just the map.

| Directory | Role |
| :--- | :--- |
| [`api/`](api/README.md) | The Supabase transport layer: clients, RPC/Edge wrappers, mappers, and Valibot schemas. |
| [`config/`](config/README.md) | The single place for tunable constants and identifiers. |
| [`services/`](services/README.md) | Infrastructure singletons and state orchestrators (storage, sync, the list "Console" engine, connectivity, PWA lifecycle). |
| [`theme/`](theme/README.md) | The design-token engine and the generated app shell. |
| [`types/`](types/README.md) | Shared TypeScript contracts. |
| [`utils/`](utils/README.md) | Pure, stateless engines: game math, formatting, sorting, IndexedDB, the priority queue. |

## Conventions

- **Validation boundary.** All data from outside (Supabase, LocalStorage, IndexedDB) is validated against a Valibot schema at the client or service entry point.
- **Persistence ignorance.** Domain models do not mirror database rows; mappers translate between them.
- **Deep imports.** Import schemas and utilities from their files directly rather than through a barrel, to keep bundles lean.

## See also

- [Frontend README](../../README.md) | [CleanStack Architecture](../../../.github/authoritative-design-references/CleanStack%20Architecture.md)
- [Backend](../../../Backend/README.md) - the Supabase project this layer talks to
- [`@shared`](../shared/README.md) - Layer 2, the direct consumer of `@core`
