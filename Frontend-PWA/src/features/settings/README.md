// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# Settings (@features/settings)

> The command center: theme and app preferences, Clan Voyage management, backend controls, and recovery tools.

**Layer 3 (@features)** | imports `@shared`, `@core` | never another feature. It hosts configuration for other domains but stays blind to their business logic.

## What it does

Each concern is a collapsible card:

- **Event management** - schedule and track a Clan Voyage (target, countdowns, live progress). Composed from the shared [`EventManagement`](../../shared/ui/README.md) component.
- **Appearance** - Light / Dark / Auto theme and a keep-screen-awake toggle.
- **Notifications** - recruit-alert threshold, app badges, and a test notification. The recruit-alert threshold actions are domain-standardized and mocked/tested using the `thresholdValue` parameter mapping.
- **Feature flags** - Blitz Mode calibration, [Android bridge](../../../../APK/README.md) detection, APK update download, and benchmark-tooltip visibility.
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
| `composables/useBackendRefresher.ts` | The maintenance triggers and their cooldowns, utilizing standard domain-descriptive catch parameters (`backendRefreshError`) for robust naming hygiene. |

## Gotchas

- Settings keeps no private config state; it delegates everything to the `useAppSettings` singleton in [`@core`](../../core/services/README.md), so preferences are shared with other features and the service worker.
- **Web push is not implemented yet.** `subscribePush` shows a "coming soon" notice pending VAPID and an Edge Function. Local notifications and app badges do work.

## See also

- [Frontend README](../../../README.md) | [`@features`](../README.md) | [`@core/services`](../../core/services/README.md) | [Voyage composables](../../shared/composables/README.md)
- [`@core/api`](../../core/api/README.md) - `MaintenanceClient` (manual backend triggers, push subscription) is Settings' primary external-call entry point
- [APK](../../../../APK/README.md) - Settings hosts Blitz Mode calibration and Android bridge detection; it is the configuration surface for the native layer
- [Backend](../../../../Backend/README.md) - the maintenance triggers (database, scanner, Key Farm) fired from Settings are documented on the backend side
- [`@features/roster`](../roster/README.md) - Settings produces the Voyage configuration that surfaces as the `VoyageBanner` inside `RosterView`
