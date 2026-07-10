// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

# Domain Types (@core/types)

The **Authoritative Interface SSOT**. A centralized repository of TypeScript interfaces, enums, and domain models that define the structural contracts for the entire Clash Manager ecosystem.

---

## Purpose
The Domain Types directory (Layer 1) provides the foundational type definitions required to ensure monorepo-wide consistency and transactional integrity. By centralizing these definitions in the kernel, the system eliminates structural drift and ensures that data crossing architectural boundaries (e.g., from the Supabase backend to the PWA UI) adheres to strict, immutable contracts.

## Architectural Context
- **Layer**: Layer 1 (@core)
- **Role**: Type Governance.
- **Import Boundaries**:
 - **Allowed**: Can import from Layer 0 (@substrate).
 - **Forbidden**: Strictly forbidden from importing from any higher layers (Shared, Features, App) or Core Services.

## Type Categories

### Native Android Bridge (`AndroidBridge`)
Formalizes the contract for communication between the PWA and the custom Kotlin native layer inside the Android wrapper.
- **Hardware Integration**: Defines methods for deep-linking (`openPlayerProfile`), OS intent brokerage (`openExternalUrl`), and Accessibility service status.
- **Blitz Calibration**: Manages the persistence and retrieval of coordinate data for the automated Blitz Mode foreground service.
- **⚠️ HARD NATIVE DEPENDENCY**: These methods are implemented in the compiled release APK. Renaming or modifying these signatures without a corresponding native update will break hardware features.

### Domain Models
The authoritative representations of the system's core entities.
- **LeaderboardMember**: Represents an active clan resident with normalized `performanceScore` and `performanceRawScore`.
- **Recruit**: Represents a discovery candidate with normalized `potentialScore`, `longevity` tracking, and heritage tenure.
- **WebAppData**: The high-fidelity snapshot containing the full clan roster, recruitment pool, and synchronization metadata.

### UI Orchestration
Standardized interfaces for global UI state and interaction patterns.
- **ConsoleFabState**: The authoritative contract for the management Floating Action Button (FAB), coordinating labels, processing states, and recruitment modes.
- **ConsoleLayoutEvents**: Eliminates 'any' pathogens from the event stream by defining the supported interaction set for the Layer 2 Molecule Layer.
- **ConsoleCardMetadata**: Standardizes card states (Expansion, Selection, Tagging) across feature views.

### Clan Voyage Subsystem
Domain models and status enums for the Voyage feature, relocated to the kernel to satisfy structural isolation.
- **VoyageStatus**: Enum defining the lifecycle phases (IDLE, PENDING, ACTIVE, COMPLETED).
- **VoyageSummary**: The complete SSOT for a voyage event, merging event configuration with per-player contribution ledgers.

---

## Integration Standards
- **Branded Types**: Utilize branding (e.g., `Gold`, `XP`) where appropriate to enforce compile-time currency isolation.
- **Strict Nomenclature**: Adhere to the `Domain_Role` pattern. Avoid anemic pathogens like `data`, `item`, or `payload` in favor of domain-descriptive identifiers (e.g., `DismissalRequest`, `MomentumInfo`).
- **Leaf Status**: As a Layer 1 module, types must remain stateless and free of logic. They define *what* the system handles, while Services and Utils define *how* it handles it.
