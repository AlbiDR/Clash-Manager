// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# Settings (@features/settings)

> The command center: theme and app preferences, Clan Voyage management, backend controls, and recovery tools.

**Layer 3 (@features)** | imports `@shared`, `@core` | never another feature. It hosts configuration for other domains but stays blind to their business logic.

## What it does

Each concern is a collapsible card:

- **Event management** - schedule and track a Clan Voyage (target, countdowns, live progress). Composed from the shared `EventManagement` component.
- **Appearance** - Light / Dark / Auto theme and a keep-screen-awake toggle.
- **Notifications** - recruit-alert threshold, app badges, and a test notification.
- **Feature flags** - Blitz Mode calibration, Android bridge detection, APK update download, and benchmark-tooltip visibility.
- **Display modes** - Showcase (demo), Blueprint (skeletons), and Synthetic (mock data).
- **Network** - live API status and a switchable Supabase endpoint.
- **Backend maintenance** - manual, cooldown-guarded triggers for the database, scanner, and Key Farm.
- **Useful links** - RoyaleAPI, Supercell ID rewards, the official store, and this repository.
- **Recovery** - force an update, clear caches, or factory-reset the app.

## Contents

| Path | Role |
| :--- | :--- |
| `views/SettingsView.vue` | Composes the cards into the shared list layout. |
| `components/` | One card per concern: `AppearanceSettings`, `NotificationSettings`, `FeatureSettings`, `ModeSettings`, `NetworkSettings`, `BackendRefresher`, `UsefulLinksSettings`, `RecoverySettings`. |
| `composables/useSettings.ts` | Wires the cards to `@core` services and settings. |
| `composables/useBackendRefresher.ts` | The maintenance triggers and their cooldowns. |

## Gotchas

- Settings keeps no private config state; it delegates everything to the `useAppSettings` singleton in `@core`, so preferences are shared with other features and the service worker.
- **Web push is not implemented yet.** `subscribePush` shows a "coming soon" notice pending VAPID and an Edge Function. Local notifications and app badges do work.

## See also

- [`@features`](../) | [`@core/services`](../../core/services/README.md) | [Voyage composables](../../shared/composables/README.md)
