# Clash Manager

[![System](https://img.shields.io/badge/System-v13.1.0-0F9D58?style=flat-square&logo=google-apps-script&logoColor=white)](Backend-GAS/README.md)
[![Client](https://img.shields.io/badge/Client-v13.1.0-0066CC?style=flat-square&logo=vue.js&logoColor=white)](Frontend-PWA/README.md)
[![Worker](https://img.shields.io/badge/Worker-v10.1.4-6D409F?style=flat-square&logo=render&logoColor=white)](Backend-Worker/README.md)
[![Docs](https://img.shields.io/badge/Docs-Architecture%20%7C%20Deployment-blue?style=flat-square)](docs/ARCHITECTURE.md)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue?style=flat-square)](LICENSE)

**An engineered ecosystem for high-precision clan leadership.**

Clash Manager is a production-grade, distributed architecture designed to automate the administrative complexities of competitive Clash Royale clans. It orchestrates a synchronized stack comprising a serverless orchestration engine, a high-concurrency proxy worker, and an offline-first progressive web application.

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
The system builds a **Persistent Clan Database**. By archiving every war, every donation cycle, and every member interaction, the system constructs a rich historical tapestry. This allows for deep trend analysis, "heritage" tracking for long-term members, and the ability to spot performance decay before it becomes a problem.

### The Valuation Engine
Not all members are equal. The system replaces intuition with a **Complex Valuation Metric** that sorts members by their true worth.
- **Raw Score**: Lifetime achievement and grind.
- **Performance Score**: Current form, momentum, and reliability.
- **Inertia**: Penalties for stagnation and inactivity.

This allows leadership to objectively identify the clan's bottom players for rotation and the top clan members for promotion, free from bias.

### The Headhunter Protocol
Recruitment is no longer a passive wait-list. The **Headhunter Engine** continuously scans global tournament brackets, and their individual battles, to populate a pool of high-potential, clanless players.
- **Deep Delegation**: The Worker handles the heavy lifting of scanning and initial scoring, applying a **Prophet Bonus** multiplier to players with proven historical war success.
- **Smart Filtering**: Automatically rejects players who don't meet the clan's exact "Hybrid Benchmark" using Valibot-enforced validation boundaries.
- **Batch Operations**: The PWA allows leaders to select promising recruits and trigger a **Batch Open** flow, launching their in-game profiles sequentially for rapid-fire inviting.

---
<br />

## System Ecosystem

<details>
<summary><strong>Backend Engine (Google Apps Script)</strong></summary>

The central nervous system. A serverless execution engine hosted on **Google Apps Script**.
- **Role**: Orchestrates ETL pipelines, manages persistent state, and executes the proprietary scoring kernel.
- **Architecture**: Registry-based Service Pattern with isolated business modules.
- **Documentation**: [Read Technical Specifications](Backend-GAS/README.md)

</details>

<details>
<summary><strong>Client Core (PWA)</strong></summary>

The command center. A **Vue 3 Progressive Web Application** designed for administrative operations.
- **Role**: Provides a fluid, low-latency interface for data visualization and deeper analytics.
- **Features**: Sovereign Design System, Offline-First (IndexedDB), and Hardware Haptics.
- **Documentation**: [Read Technical Specifications](Frontend-PWA/README.md)

</details>

<details>
<summary><strong>Remote Worker (Render)</strong></summary>

The muscle. A high-performance Node.js service hosted on **Render**.
- **Role**: Offloads high-volume network operations and scanning tasks to circumvent platform quotas.
- **Capabilities**: Parallel processing, Smart Key Rotation, and "Headless" API proxying.
- **Documentation**: [Read Technical Specifications](Backend-Worker/README.md)

</details>

---
<br />

## Architectural Topology

The system utilizes a distributed data flow to ensure high integrity and sub-second interaction latency.

```mermaid
flowchart TD
    subgraph Upstream
        CRAPI["Clash Royale API"]
    end

    subgraph "Serverless Core (GAS)"
        Orchestrator["Orchestrator<br/>(Cron & Events)"]
        Kernel["Scoring Kernel<br/>(Math & Logic)"]
        Store["Google Sheets<br/>(Persistence)"]
    end

    subgraph "Compute Layer (Render)"
        Worker["Remote Worker<br/>(Node.js/Express)"]
    end

    subgraph "Client Layer (PWA)"
        UI["Vue 3 Interface<br/>(Sovereign Design)"]
        Cache[(IndexedDB)]
    end

    Orchestrator -->|Delegates Scan| Worker
    Worker <-->|High-Volume Fetch| CRAPI
    Orchestrator <-->|Sync| Store
    UI <-->|JSON Headless| Orchestrator
    UI <-->|Hydration| Cache
    UI <-->|Direct Scan & Push| Worker
```


---
<br />

## Deployment Protocol

The system requires a synchronized deployment across all three environments.

<details>
<summary><strong>Phase 1: Computing Layer (Render)</strong></summary>

The worker must be online first to provide endpoints for the orchestration engine.

  **Source**: `Backend-Worker/`
  **Environment**: Node.js Service
  **Requirements**:
    - `WORKER_CONCURRENCY`: `20`
    - `API_KEYS`: Comma-separated list of tokens.
    - `REMOTE_WORKER_SECRET`: Auth token for worker communication.
  **Action**: `pnpm build && pnpm start`

</details>

<details>
<summary><strong>Phase 2: Orchestration Engine (Apps Script)</strong></summary>

The Core connects the database (Sheets) to the Worker.

  **Source**: `Backend-GAS/`
  **Environment**: Google Apps Script
  **Configuration**:
    - `REMOTE_WORKER_URL`: The HTTPS endpoint from Phase 1.
    - `CLAN_TAG`: Target resource identifier.
  **Action**: `clasp push` followed by `createTriggers()` in the Orchestrator.

</details>

<details>
<summary><strong>Phase 3: Operational Interface (PWA)</strong></summary>

The Client consumes the headless JSON API exposed by the Core.

  **Source**: `Frontend-PWA/`
  **Environment**: Static Web Host (e.g., GitHub Pages)
  **Configuration**:
    - `VITE_GAS_URL`: The Web App URL generated in Phase 2.
  **Action**: `pnpm build`

</details>

---
<br />

## Development Standards

The system adheres to a strict "Clean Stack" philosophy to maintain long-term stability and code purity.

- **Pristine Logic**: Business logic is isolated in pure functions (`Scoring_Kernel`) or composables (`useHeadhunter`).
- **Zero-Drift**: All modules must maintain synchronicity with their respective README specifications.
- **Semantic Versioning**: Strict adherence to `Major.Minor.Patch` protocols across the monorepo.
- **Visual Integrity**: The interfaces must strictly follow the Sovereign Design System (No utility-class pollution).

---
<br />

## License

**GNU GPL v3**.
Copyright (c) 2026 AlbiDR.
This project is free software and available under the [GPL v3 License](LICENSE).
