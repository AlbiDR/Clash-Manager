# Clash Manager

[![Backend](https://img.shields.io/badge/Backend-v1.8.0-3ECF8E?style=flat-square&logo=supabase&logoColor=white)](Backend/README.md)
[![Client](https://img.shields.io/badge/Client-v13.3.0-0066CC?style=flat-square&logo=vue.js&logoColor=white)](Frontend-PWA/README.md)
[![Docs](https://img.shields.io/badge/Docs-Architecture%20%7C%20Deployment-blue?style=flat-square)](.github/authoritative-design-references/CleanStack%20Architecture.md)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue?style=flat-square)](LICENSE)

**An engineered ecosystem for high-precision clan leadership.**

Clash Manager is a production-grade, distributed architecture designed to automate the administrative complexities of competitive Clash Royale clans. It orchestrates a synchronized **Supabase Binary Stack** comprising an edge-native ingestion engine and an offline-first progressive web application.

---
<br />

## Screenshots

<div align="left">
  <details style="margin-bottom: 16px; border: 1px solid #3178C6; border-radius: 10px; background-color: #f6f8fa;">
    <summary style="cursor: pointer; color: #3178C6; padding: 10px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;">
      <strong>Light Mode</strong>
    </summary>
    <div style="display: flex; gap: 10px; padding: 10px; background-color: #ffffff; border-bottom-left-radius: 10px; border-bottom-right-radius: 10px;">
      <img src="Frontend-PWA/public/assets/branding/roster-light.webp" width="49%" style="border: 1.5px solid #3178C6; border-radius: 8px;" />
      <img src="Frontend-PWA/public/assets/branding/headhunter-light.webp" width="49%" style="border: 1.5px solid #3178C6; border-radius: 8px;" />
    </div>
  </details>

  <details style="margin-bottom: 16px; border: 1px solid #3178C6; border-radius: 10px; background-color: #161b22;">
    <summary style="cursor: pointer; color: #3178C6; padding: 10px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;">
      <strong>Dark Mode</strong>
    </summary>
    <div style="display: flex; gap: 10px; padding: 10px; background-color: #0d1117; border-bottom-left-radius: 10px; border-bottom-right-radius: 10px;">
      <img src="Frontend-PWA/public/assets/branding/roster-dark.webp" width="49%" style="border: 1.5px solid #3178C6; border-radius: 8px;" />
      <img src="Frontend-PWA/public/assets/branding/headhunter-dark.webp" width="49%" style="border: 1.5px solid #3178C6; border-radius: 8px;" />
    </div>
  </details>
</div>

---
<br />

## Mission Architecture

Most clan tools rely on ephemeral API fetches—displaying a snapshot of the present moment that vanishes upon refresh. **Clash Manager is different.**

### Persistence vs. Ephemerality
The system builds a **Persistent Clan Database** in Supabase. By archiving every war, every donation cycle, and every member interaction, the system constructs a rich historical tapestry. This allows for deep trend analysis, "heritage" tracking for long-term members, and the ability to spot performance decay before it becomes a problem.

### The Valuation Engine
The system replaces intuition with a **Complex Valuation Metric** that sorts players by their true worth across two distinct dimensions.

<details>
<summary><strong>Internal Metrics: Clan Roster (RPeS & PeS)</strong></summary>

- **RPeS (Raw Performance Score)**: The absolute value derived from lifetime stats (donations, war fame, trophies).
- **PeS (Performance Score)**: A relative percentage (0-100%) normalized against the current clan benchmark.
- **Inertia & Heritage**: Logic that applies inactivity decay to stagnant players while providing momentum bonuses to new recruits.

</details>

<details>
<summary><strong>External Metrics: Headhunter Discovery (RPoS & PoS)</strong></summary>

- **RPoS (Raw Potential Score)**: Calculated from a recruit's external battle logs and war consistency.
- **PoS (Potential Score)**: Normalized potential compared against internal clan performance.

</details>

### The Headhunter Protocol
Recruitment is no longer passive. The **Headhunter Engine** continuously scans global tournament brackets via Supabase Edge Functions to identify elite, clanless recruits.
- **Edge-Native Discovery**: High-concurrency Deno functions scan tournaments 24/7.
- **Smart Filtering**: Valibot-enforced validation ensures only top-tier candidates reach the UI.
- **Batch Operations**: Sequence-driven blitzing allows leaders to invite dozens of recruits in minutes.

---
<br />

## Dictionary

- **DeepNet**: The high-performance, offline-first PWA infrastructure (v7+) designed for administrative clan operations.
- **Headhunter**: The global discovery engine that autonomously scans tournaments to identify elite, clanless recruits.
- **Nightly**: The automated, 7-stage maintenance pipeline that ensures monorepo-wide structural integrity and synchronization.

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
- **Features**: Sovereign Design System, Offline-First (IndexedDB), and Hardware Haptics.
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

The ecosystem is maintained by a 7-agent autonomous pipeline that executes nightly to ensure structural purity, security, and documentation synchronization. This pipeline operates directly on the `Nightly` branch and follows a strictly sequenced maintenance cycle:

1.  **Harden**: Secures validation boundaries and eliminates the "any" plague across the stack.
2.  **Verify**: Proves system integrity through automated test suite execution and ADR checks.
3.  **Optimize**: Refines code structures, enforces DRY principles, and prunes dead code.
4.  **Document (README)**: The Structural Archivist. Synchronizes technical blueprints with implementation state.
5.  **Document (TSDoc)**: The Technical Writer. Hardens interface contracts and architectural remarks.
6.  **Version Integrity**: The Release Engineer. Enforces strict semantic versioning.
7.  **Dependency Audit**: The Watchkeeper. Monitors external dependency health and security.

---
<br />

## Deployment Protocol

The system requires a synchronized deployment across the Supabase and PWA environments.

<details>
<summary><strong>Phase 1: Backend Layer (Supabase)</strong></summary>

Deploy the database schema and ingestion functions first.

  **Source**: `Backend/`
  **Requirements**:
    - `ROYALE_API_KEYS`: The Key Farm (10 Supercell JWTs).
    - `CLAN_TAG`: Target resource identifier (SSOT).
  **Action**: 
    1. `supabase link --project-ref <id>`
    2. `supabase db push` (Sync Migrations)
    3. `supabase functions deploy ingest-royale-data`
    4. `supabase functions deploy headhunter-scanner`

</details>

<details>
<summary><strong>Phase 2: Operational Interface (PWA)</strong></summary>

The Client consumes the features exposed by Supabase.

  **Source**: `Frontend-PWA/`
  **Environment**: Static Web Host
  **Configuration**:
    - `VITE_SUPABASE_URL`: Your project endpoint.
    - `VITE_SUPABASE_PUBLISHABLE_KEY`: The `anon` key.
  **Action**: 
    1. `pnpm build`
    2. Upload the `dist/` directory contents to your host.

</details>

---
<br />

## Development Standards

The system adheres to a strict "Clean Stack" philosophy to maintain long-term stability and code purity.

- **Pristine Logic**: Business logic is isolated in pure functions or Supabase SQL triggers.
- **Zero-Drift**: All modules must maintain synchronicity with their respective README specifications.
- **Semantic Versioning**: Strict adherence to `Major.Minor.Patch` protocols across the monorepo.
- **Visual Integrity**: The interfaces must strictly follow the Sovereign Design System (No utility-class pollution).

---
<br />

## License

**GNU GPL v3**.
Copyright (c) 2026 AlbiDR.
This project is free software and available under the [GPL v3 License](LICENSE).
