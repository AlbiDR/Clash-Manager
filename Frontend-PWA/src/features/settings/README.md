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
- **Feature flags** - Blitz Mode calibration (with decomposed Android-specific permissions, APK update install approval, and layout coordinates calibration), [Android bridge](../../../../APK/README.md) detection, APK update download, and benchmark-tooltip visibility.
- **Display modes** - Showcase (demo), Blueprint (skeletons), and Synthetic (mock data).
- **Network** - live API status and a switchable Supabase endpoint.
- **Backend maintenance** - manual, cooldown-guarded triggers for the database, scanner, and Key Farm (utilizing centralized `BACKEND_REFRESH_COOLDOWN_SECONDS` and `BACKEND_REFRESH_COOLDOWN_INTERVAL` constants to ensure consistent cooldown behavior across settings and refresh utilities; modernized with 48px touch targets, `v-tactile` haptic feedback, and text selection containment).
- **Useful links** - Localized and dynamic shortcuts (such as RoyaleAPI Blog/Giveaway, localized Supercell ID rewards and Clash Royale Store, the GitHub repository link, and a Download Android App action that targets the latest versioned APK and is hidden inside the native Android wrapper container).
- **Recovery & Installation** - force an update, clear caches, factory-reset the app, trigger the PWA installation dialog on eligible web environments, and inspect native APK update status with version, checksum, artifact, and changelog details.

## Contents

| Path | Role |
| :--- | :--- |
| `views/SettingsView.vue` | Composes the cards into the shared list layout (integrated with route data loader `useClashDataLoader` to handle routing-level data hydration). |
| `components/` | One card per concern: `AppearanceSettings`, `NotificationSettings`, `FeatureSettings` (decomposed to delegate Android permissions and layout calibration to the `AndroidCalibrationSettings` sub-component), `ModeSettings`, `NetworkSettings`, `BackendRefresher`, `UsefulLinksSettings`, `RecoverySettings`. |
| `composables/useSettings.ts` | Wires the cards to `@core` services and settings. |
| `composables/useBackendRefresher.ts` | The maintenance triggers and their cooldowns, utilizing standard domain-descriptive catch parameters (`backendRefreshError`) for robust naming hygiene, constrained by the centralized `BACKEND_REFRESH_COOLDOWN_SECONDS` and `BACKEND_REFRESH_COOLDOWN_INTERVAL` constants. |

## Gotchas

- Settings keeps no private config state; it delegates everything to the `useAppSettings` singleton in [`@core`](../../core/services/README.md), so preferences are shared with other features and the service worker.
- **Web push is not implemented yet.** `subscribePush` shows a "coming soon" notice pending VAPID and an Edge Function. Local notifications and app badges do work.

## See also

- [Frontend README](../../../README.md) | [`@features`](../README.md) | [`@core/services`](../../core/services/README.md) | [Voyage composables](../../shared/composables/README.md)
- [`@core/api`](../../core/api/README.md) - `MaintenanceClient` (manual backend triggers, push subscription) is Settings' primary external-call entry point
- [APK](../../../../APK/README.md) - Settings hosts Blitz Mode calibration and Android bridge detection; it is the configuration surface for the native layer
- [Backend](../../../../Backend/README.md) - the maintenance triggers (database, scanner, Key Farm) fired from Settings are documented on the backend side
- [`@features/roster`](../roster/README.md) - Settings produces the Voyage configuration that surfaces as the `VoyageBanner` inside `RosterView`
