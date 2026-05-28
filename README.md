<div align="center">
  <img src=".github/assets/logo.png" alt="Clash Manager Logo" width="500" />
</div>

---

# Clash Manager

[![Backend](https://img.shields.io/badge/Backend-v14.0.0-3ECF8E?style=flat-square&logo=supabase&logoColor=white)](Backend/README.md)
[![Client](https://img.shields.io/badge/Client-v14.0.0-0066CC?style=flat-square&logo=vue.js&logoColor=white)](Frontend-PWA/README.md)
[![Docs](https://img.shields.io/badge/Docs-Architecture%20%7C%20Deployment-blue?style=flat-square)](.github/authoritative-design-references/CleanStack%20Architecture.md)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue?style=flat-square)](LICENSE)

**An engineered ecosystem for high-precision clan leadership.**

Clash Manager is a production-grade, distributed architecture designed to automate the administrative complexities of competitive Clash Royale clans. It orchestrates a synchronized **Supabase Binary Stack** comprising an edge-native ingestion engine and a live-synchronized, persistence-backed progressive web application.

---
<br />

## Screenshots

<div align="left">
  <details style="margin-bottom: 16px; border: 1px solid #3178C6; border-radius: 10px; background-color: #f6f8fa;">
    <summary style="cursor: pointer; color: #3178C6; padding: 10px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;">
      <strong>Light Mode</strong>
    </summary>
    <div style="display: flex; flex-wrap: wrap; align-items: flex-start; gap: 10px; padding: 10px; background-color: #ffffff; border-bottom-left-radius: 10px; border-bottom-right-radius: 10px;">
      <img src="Frontend-PWA/public/assets/branding/roster-light.webp?v=1778945289" width="49%" style="border: 1.5px solid #3178C6; border-radius: 8px;" />
      <img src="Frontend-PWA/public/assets/branding/headhunter-light.webp?v=1778945289" width="49%" style="border: 1.5px solid #3178C6; border-radius: 8px;" />
      <img src="Frontend-PWA/public/assets/branding/laboratory-light.webp?v=1778945289" width="49%" style="border: 1.5px solid #3178C6; border-radius: 8px;" />
      <img src="Frontend-PWA/public/assets/branding/settings-light.webp?v=1778945289" width="49%" style="border: 1.5px solid #3178C6; border-radius: 8px;" />
    </div>
  </details>

  <details style="margin-bottom: 16px; border: 1px solid #3178C6; border-radius: 10px; background-color: #161b22;">
    <summary style="cursor: pointer; color: #3178C6; padding: 10px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;">
      <strong>Dark Mode</strong>
    </summary>
    <div style="display: flex; flex-wrap: wrap; align-items: flex-start; gap: 10px; padding: 10px; background-color: #0d1117; border-bottom-left-radius: 10px; border-bottom-right-radius: 10px;">
      <img src="Frontend-PWA/public/assets/branding/roster-dark.webp?v=1778945289" width="49%" style="border: 1.5px solid #3178C6; border-radius: 8px;" />
      <img src="Frontend-PWA/public/assets/branding/headhunter-dark.webp?v=1778945289" width="49%" style="border: 1.5px solid #3178C6; border-radius: 8px;" />
      <img src="Frontend-PWA/public/assets/branding/laboratory-dark.webp?v=1778945289" width="49%" style="border: 1.5px solid #3178C6; border-radius: 8px;" />
      <img src="Frontend-PWA/public/assets/branding/settings-dark.webp?v=1778945289" width="49%" style="border: 1.5px solid #3178C6; border-radius: 8px;" />
    </div>
  </details>
</div>

---
<br />

## Mission Architecture

Most clan tools rely on ephemeral API fetches-displaying a snapshot of the present moment that vanishes upon refresh. **Clash Manager is different.**

### Persistence vs. Ephemerality
The system builds a **Persistent Clan Database** in Supabase. By archiving every war, every donation cycle, and every member interaction, the system constructs a rich historical tapestry. This allows for deep trend analysis, "heritage" tracking for long-term members, and the ability to spot performance decay before it becomes a problem.

### The Scoring Engine
The system replaces intuition with a **Complex Valuation Metric** that sorts players by their true worth across two distinct dimensions.

<details>
<summary><strong>Internal Metrics: Clan Roster (RPeS & PeS)</strong></summary>

- **RPeS (Raw Performance Score)**: The absolute value derived from a member's contributions while being part of the clan (donations, war fame, war participation, trophies, tenure Clan Voyage participation).
- **PeS (Performance Score)**: A relative percentage (0-100%) normalized against active clan benchmarks and adjusted via Inertia & Heritage logic.
- **Inertia & Heritage**: Algorithmic decay applied to stagnant profiles, balanced by momentum tracking for incoming recruits to eliminate historic stat bias.


</details>

<details>
<summary><strong>External Metrics: Headhunter Scouting (RPoS & PoS)</strong></summary>

- **RPoS (Raw Potential Score)**: Calculated from a recruit's lifetime external battle logs, donations and war consistency.
- **PoS (Potential Score)**: A relative percentage (0-100%) normalized against the last month of scouted recruits and compared against the current internal clan performance for coherency.

</details>

### The Headhunter Protocol
Recruitment is no longer passive. The **Headhunter Engine** continuously scans global tournament brackets and active members' battle logs via Supabase Edge Functions to identify elite, clanless recruits.
- **Edge-Native Discovery**: High-concurrency Deno functions scan tournaments and active member battles around the clock.
- **Smart Filtering**: Valibot-enforced validation ensures only top-tier candidates reach the UI.
- **Batch Operations**: Sequence-driven blitzing allows leaders to invite recruits in minutes.

---
<br />

## Dictionary

- **DeepNet**: The high-performance, sovereign PWA infrastructure featuring intelligent local caching and live synchronization for administrative clan operations.
- **Headhunter**: The global discovery engine that autonomously scans tournaments and active members' battles to identify elite, clanless recruits.
- **Nightly**: The automated, multi-stage maintenance pipeline that ensures monorepo-wide structural integrity and synchronization.

---
<br />

## System Ecosystem

<details>
<summary><strong>Supabase Backend (Binary Stack)</strong></summary>

The central nervous system. A high-performance infrastructure hosted on **Supabase**.
- **Role**: Orchestrates ingestion pipelines, manages persistent state, and exposes materialized features.
- **Architecture**: Unitary Database with isolated `substrate`, `drivers`, and `features` schemas.
- **Documentation**: [Read Technical Specifications](Backend/README.md)

</details>

<details>
<summary><strong>Client Core (PWA)</strong></summary>

The command center. A **Vue 3.5 Progressive Web Application** designed for administrative operations.
- **Role**: Provides a fluid, low-latency interface for data visualization and deeper analytics.
- **Features**: Sovereign Design System, Persistent Caching (IndexedDB), and Hardware Haptics.
- **Documentation**: [Read Technical Specifications](Frontend-PWA/README.md)

</details>

---
<br />

## Architectural Topology

The system utilizes a linear, high-integrity data flow with sub-second interaction latency.

```mermaid
flowchart TD
    subgraph Upstream
        CRAPI["Clash Royale API"]
    end

    subgraph "Supabase Backend"
        Edge["Edge Functions<br/>(Deno / Ingestion)"]
        DB["Postgres Substrate<br/>(Storage & Logic)"]
        Views["Feature Views<br/>(API Ready)"]
    end

    subgraph "Client Layer (PWA)"
        UI["Vue 3 Interface<br/>(Sovereign Design)"]
        Cache[(IndexedDB)]
    end

    Edge <-->|Round-Robin Fetch| CRAPI
    Edge -->|Ingest| DB
    DB -->|Project| Views
    UI <-->|RPC & Query| Views
    UI <-->|Hydration| Cache
    UI -->|Manual Trigger| Edge
```

---
<br />

## Nightly Pipeline

The Nightly pipeline is an automated maintenance and optimization engine designed to enforce structural purity, optimize performance, and synchronize system documentation. Running nightly on the `Nightly` branch, this sequenced multi-agent pipeline executes key phases to keep the monorepo pristine:

1.  **Harden**: Secures validation boundaries and eliminates the "any" plague across the stack.
2.  **Verify**: Proves system integrity through automated test suite execution and ADR checks.
3.  **Optimize**: Refines code structures, enforces DRY principles, and prunes dead code.
4.  **Document (README)**: The Structural Archivist. Synchronizes technical blueprints with implementation state.
5.  **Document (TSDoc)**: The Technical Writer. Hardens interface contracts and architectural remarks.
6.  **Version Integrity**: The Release Engineer. Enforces strict semantic versioning.
7.  **Dependency Audit**: The Watchkeeper. Monitors external dependency health and security.
8.  **Refactor**: The Structural Architect. Orchestrates large-scale structural improvements and architectural migrations.

---
<br />

## License

**GNU GPL v3**.
Copyright (c) 2026 AlbiDR.
This project is free software and available under the [GPL v3 License](LICENSE).
