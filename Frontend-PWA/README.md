// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# Clash Manager PWA

[![Client](https://img.shields.io/badge/Client-v14.43.2-42b883?style=flat-square&logo=vue.js&logoColor=white)](README.md)
[![Vue 3.5](https://img.shields.io/badge/Vue-3.5-42b883?style=flat-square&logo=vue.js&logoColor=white)](https://vuejs.org)
[![Vite 7](https://img.shields.io/badge/Vite-7-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vite.dev)

The Vue 3.5 progressive web app: an installable, offline-first dashboard for Clash Royale clan leaders. It reads the scored roster and recruit data from the [backend](../Backend/README.md) and adds the Roster, Headhunter, Laboratory, and Settings consoles.

> For the product tour and screenshots, see the [root README](../README.md). This document is the client's developer guide.

---

## Quick start

Requires Node 24+ and pnpm 10+.

```bash
pnpm install
pnpm dev            # http://localhost:5173  (from this directory)
```

Create a `.env` here pointing at a Supabase project:

```ini
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

```bash
pnpm build          # type-check + production build
pnpm test           # Vitest
pnpm type-check     # vue-tsc
```

---

## Architecture

The client follows the four-layer CleanStack model, enforced by dependency-cruiser on every commit. Each directory has its own README; start there when working in a layer.

| Layer | Directory | Role |
| :--- | :--- | :--- |
| L1 Core | [`src/core/`](src/core/README.md) | Framework-agnostic infrastructure: [api](src/core/api/README.md), [config](src/core/config/README.md), [services](src/core/services/README.md), [theme](src/core/theme/README.md), [types](src/core/types/README.md), [utils](src/core/utils/README.md). |
| L2 Shared | [`src/shared/`](src/shared/README.md) | Domain-blind [ui](src/shared/ui/README.md), [composables](src/shared/composables/README.md), [directives](src/shared/directives/README.md), and [utils](src/shared/utils/README.md). |
| L3 Features | [`src/features/`](src/features/README.md) | The feature silos: [roster](src/features/roster/README.md), [headhunter](src/features/headhunter/README.md), [laboratory](src/features/laboratory/README.md), [settings](src/features/settings/README.md). |
| L4 App | [`src/app/`](src/app/README.md) | Shell, router, and service worker. |

Dependencies point inward only: a feature never imports another feature, and only the app layer may import features. The full ruleset is the [CleanStack Architecture reference](../.github/authoritative-design-references/CleanStack%20Architecture.md).

---

## Platform capabilities

- **Offline-first shell.** The service worker precaches the app and serves it cache-first for a sub-second start. Clan data uses stale-while-revalidate: cached data shows instantly, then a background refresh updates it. (There is no runtime SWR on arbitrary network requests; the shell is precached.)
- **Local persistence.** IndexedDB via `StorageService`, with a transparent in-memory fallback for restricted environments.
- **Realtime and cross-tab.** Supabase realtime (recruit dismissals, Voyage) plus `BroadcastChannel` keep state consistent across devices and tabs.
- **OS integration.** Installable, with app shortcuts, a Web Share target for player tags, a `web+clash` protocol handler, desktop side-panel support, app badges, and haptics.
- **Android bridge.** When running inside the [Android wrapper](../APK/README.md), the app detects `window.AndroidBridge` to open profiles in-game and drive Blitz Mode.

---

## Design system

A custom "Neo-Material" system in [`src/core/theme/`](src/core/theme/README.md), documented in full in [DESIGN.md](../DESIGN.md), with a strict no-dependency rule: zero third-party UI, icon, or charting libraries. Every icon and chart is hand-built SVG, all styling is driven by `--sys-*` CSS variables, and the fonts (Inter, JetBrains Mono) are self-hosted.

---

## Tech stack

| Area | Technology |
| :--- | :--- |
| Framework | Vue 3.5, TypeScript (strict) |
| Routing | Vue Router 5 (experimental data loaders), hash history |
| State | Pinia |
| Validation | Valibot (boundaries on all external data) |
| Build | Vite 7, vue-tsc |
| PWA | vite-plugin-pwa, Workbox (custom `injectManifest` service worker) |
| Data | @supabase/supabase-js |
| Testing | Vitest, @vue/test-utils, jsdom |

---

## Quality

Tests are co-located in `*-tests/` folders next to nearly every source file. Beyond local tests, the monorepo is maintained by a [13-stage autonomous nightly pipeline](../README.md#autonomous-nightly-pipeline) that refreshes documentation, reconciles versions, and audits architecture.

---

## License

Released under the [GPL-3.0-only](../LICENSE) license. Copyright (C) 2026 AlbiDR.
