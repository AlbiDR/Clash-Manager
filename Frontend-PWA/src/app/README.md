// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# app

> Layer 4: the shell, router, and service worker that compose the features into a single working PWA.

**Layer 4 (@app)** | may import `@features`, `@shared`, `@core` | nothing may import from it. This is the only layer allowed to import features.

## Responsibilities

- Mount the app shell and wire global UI (connectivity strip, page transitions, navigation dock, toasts).
- Define routes and lazy-load each feature view.
- Register and run the service worker for offline support and background badge sync.

## Contents

| Path | Role |
| :--- | :--- |
| `App.vue` | Root shell: connectivity strip, `RouterView` inside an error boundary, the floating dock, and toasts. |
| `main.ts` | Bootstrap: validate config, init settings and theme, register Pinia, the router, directives, and the global `Icon`, then mount. |
| `router/` | Routes (`/roster`, `/headhunter`, `/laboratory`, `/settings`), View Transitions, scroll restoration, and chunk-load recovery. |
| `sw.ts`, `sw/` | The service worker: precaching, cache-first navigation, background sync, and the update lifecycle. |

## How it works

- **Navigation** is lazy: each feature view is a dynamic import, so nothing feature-specific is in the initial bundle. Navigations use the View Transitions API and restore scroll from `sessionStorage`.
- **Offline** relies on Workbox precaching the app shell and serving it cache-first for a sub-second start. Clan data freshness is handled by `@core` (stale-while-revalidate), not by the service worker; there are no runtime network SWR strategies here.
- **Background badge sync** (`sw/swSync.ts`) runs a `periodicsync` handler that queries the headhunter view directly and updates the recruit badge, independent of the `@core` services.

## See also

- [`@core`](../core/README.md) | [`@shared`](../shared/README.md) | [`@features`](../features)
- Tests: `sw/sw-tests/`
