// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# Settings : Configuration & Recovery Orchestrator

The **Command Center**. A self-contained Feature (Layer 3) responsible for managing application-level configuration, hardware brokerage, and system recovery protocols.

---

## Purpose
The Settings feature provides a centralized interface for users to calibrate the application's behavior, manage connectivity to the distributed backend, and perform diagnostic or recovery actions when the system encounters environmental instability.

## Architectural Context
- **Layer**: Layer 3 (@features)
- **Isolation**: Strictly decoupled. While it acts as a host for decentralized configuration, it remains domain-blind to the business logic of the features it serves.
- **Orchestration**: Operates as a **Feature Orchestrator** through the `useSettings` composable. It directly composes management components (e.g., Voyage's `EventManagement`) from `@shared` to maintain centralized administrative control within a standardized shell.

## Logic Subsystems

### Hardware & Utility Brokerage (AppearanceSettings.vue)
Brokers access to device-level capabilities through Layer 2 drivers.
- **Theme Engine**: Interfaces with `@shared/composables/useTheme` to apply hex/RGB design tokens as CSS variables for Light, Dark, and Auto modes.
- **Wake Lock**: Coordinates with `@shared/composables/useWakeLock` to prevent device sleep during intensive operations, ensuring synchronization integrity.

### Feature Configuration (FeatureSettings.vue)
Brokers access to advanced application behaviors and hardware-delegated services.
- **Blitz Mode Calibration**: Provides a calibration interface for the native Android wrapper's foreground service coordinates.
- **Hardware Bridge Detection**: Automatically detects the presence of the `AndroidBridge` JSBridge to toggle between PWA-driven and hardware-delegated Blitz Mode.
- **APK Updates**: Orchestrates native Android shell updates by brokering download intents through the `@core/services/usePwaManager` kernel.
- **Benchmarking Toggles**: Manages visibility for cross-feature performance auditing tooltips.

### Environment & Audit Controls (ModeSettings.vue)
Manages specialized application modes used for auditing and demonstration.
- **Showcase Mode**: Acts as a master toggle that synchronizes Blueprint (structural) and Synthetic (data) modes.
- **Blueprint Mode**: Interfaces with `@core/services/useBlueprintMode` to force geometric skeleton rendering for layout auditing.
- **Synthetic Mode**: Interfaces with `@core/services/useSyntheticMode` to redirect data ingestion to high-fidelity mock payloads.

### Backend Maintenance (BackendRefresher.vue)
Orchestrates manual maintenance triggers for the distributed backend engines.
- **Engine Selection**: Allows for targeted manual updates of the Database, Scanner, and Key Farm.
- **Cooldown Governance**: Enforces backend-defined cooldowns to prevent API exhaustion and redundant maintenance cycles.

### Connectivity & API Management (NetworkSettings.vue)
The primary interface for managing the distributed backend lifecycle.
- **Handshake Discovery**: Reflects the logical API status (Online, Waking, Offline) derived from `@core/api/useApiState`.
- **Endpoint Management**: Manages connectivity to the Supabase backend and Edge Functions, ensuring the PWA is pointed at the authoritative data source.

### Notifications & Push Alerts (NotificationSettings.vue)
Orchestrates the application's reactive feedback loop.
- **Permission Lifecycle**: Interfaces with `@core/services/usePwaManager` to probe and manage `notificationPermission` and `isPushSubscribed` states.
- **Web Push**: VAPID-based cloud push is not yet implemented. The `subscribePush` handler is currently a placeholder that surfaces a "coming soon" notice pending Edge Function setup.
- **Badging**: Interfaces with `@core/services/useBadge` to manage application-level notification badges across inconsistent platform APIs (iOS vs Android).

### External Resources (UsefulLinksSettings.vue)
Brokers access to authoritative external domain resources.
- **Ecosystem Links**: Centralizes access to RoyaleAPI (Blog/Giveaways), Supercell ID Rewards, and the official Clash Royale Store.
- **Open Source**: Provides direct access to the Clash Manager GitHub repository.

### System Recovery & Lifecycle (RecoverySettings.vue)
Provides failsafe mechanisms for resolving structural or state corruption. All recovery actions are delegated to the `@core/services/usePwaManager` kernel to ensure infrastructure concerns remain orthogonal to the feature layer.
- **Atomic Updates**: Triggers explicit Service Worker update checks to ensure the client is running the latest authoritative version.
- **Cache Purging**: Executes a non-destructive wipe of the Cache API and Service Worker registrations to resolve asset delivery failures.
- **Factory Reset**: A destructive wipe of all local persistence (IndexedDB, LocalStorage) to resolve deep state corruption.

## Component Topology
The UI is organized into a modular, card-based layout to ensure scalability and consistent visual hierarchy.
- **SettingsView.vue**: The top-level orchestrator that composes sub-settings into a standardized `ConsoleLayout`. It acts as a collector for decentralized configuration modules (FeatureSettings, NetworkSettings, etc.) and externally composed feature managers (EventManagement).
- **SettingsCard.vue**: A Layer 2 container that provides standardized expansion behavior and iconography.
- **SkeletonSettingsCard.vue**: Provides geometric stability during initial hydration via a specialized skeleton implementation.
- **Sub-Setting Modules**: Decomposed cards (`AppearanceSettings.vue`, `FeatureSettings.vue`, `ModeSettings.vue`, `NetworkSettings.vue`, `NotificationSettings.vue`, `UsefulLinksSettings.vue`, `RecoverySettings.vue`, `BackendRefresher.vue`) that encapsulate specific configuration domains.

## State Management
The Settings feature does not maintain private state for configuration. Instead, it delegates all persistence and reactive flag management to the `@core/services/useAppSettings` singleton. This ensures that user preferences are globally accessible to other features and the Service Worker.

## Import Boundaries
To maintain "Clean Stack" integrity, this feature adheres to strict directional dependency rules:
- **ALLOWED**: Imports from `@core` (infrastructure) and `@shared` (UI primitives).
- **FORBIDDEN**: Cross-feature imports (e.g., importing from `headhunter` or `roster`).
- **FORBIDDEN**: Direct DOM manipulation or hardware API access (must use Layer 1/2 brokers).
