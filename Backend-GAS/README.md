# Clash Manager — Google Apps Script Engine

[![System](https://img.shields.io/badge/System-v13.1.0-0F9D58?style=flat-square&logo=google-apps-script&logoColor=white)](https://github.com/albidr/Clash-Manager) [![Docs](https://img.shields.io/badge/Docs-Architecture%20%7C%20Deployment-blue?style=flat-square)](../docs/ARCHITECTURE.md) [![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue?style=flat-square)](../LICENSE)

The **Operational Core**. A high-performance, event-driven Google Apps Script runtime that serves as the **Central Nervous System** of the Clash Manager ecosystem. It implements a strict **Registry-based Service Architecture** to decouple business logic, persistent storage, and UI presentation.

---
<br />

## System Architecture

The codebase adheres to the **"Clean Stack"** philosophy, organized into distinct layers:

| Layer | Responsibility | Key Modules |
| :--- | :--- | :--- |
| **Orchestrator** | Event handling, cron jobs, and master protocol execution | `Orchestrator.ts` |
| **Registry** | Dependency injection and service location | `Registry.ts`, `Core.ts` |
| **Services** | Pure business logic and complex calculations | `Scoring_Kernel.ts`, `Network.ts`, `Time.ts` |
| **Modules** | Domain-specific features (MVCS Pattern) | `Roster.ts`, `Headhunter.ts`, `Database.ts` |
| **Views** | Sheet manipulation and UI rendering | `View.ts`, `*_View.ts` |
| **Stores** | Data persistence and state management | `Store.ts`, `*_Store.ts` |

---
<br />

## Key Components

### Network Engine (`Network.ts`)
A sophisticated API gateway that manages the limited Google Apps Script quotas.
- **Multi-Tier Caching**: Uses L1 (Execution Memory) and L2 (ScriptCache) to deduplicate requests.
- **Remote Delegation**: Automatically offloads requests to the **Backend-Worker** (Render) to preserve local quota.
- **Quota Guard**: Implements a strict **>50 batch quota guard** that prevents local fallbacks for large requests if the worker is offline, protecting the core service from accidental exhaustion.
- **Smart Rotation**: Manages a pool of API keys with automatic failure handling and cooling periods.

### The Orchestrator (`Orchestrator.ts`)
The central nervous system that manages automation lifecycles.
- **Master Protocol**: `dispatchMaster()` executes the full ETL pipeline sequentially (Ingest -> Analyze -> Scout -> Clean).
- **Self-Healing**: Automatically detects and repairs broken triggers or UI controls.
- **Mobile Controls**: Listens for checkbox interactions in **cell A1** of specific sheets (`handleMobileEdit`) to trigger on-demand syncs, enabling management via the mobile app.

### Scoring Kernel (`Scoring_Kernel.ts`)
A pure mathematical engine isolated from the rest of the system.
- **Performance Metrics**: Distinguishes between **Raw Score** (lifetime achievement and grind) and **Performance Score** (current momentum and form).
- **Potential Metrics**: Evaluates recruits via **Raw Potential** (Unweighted) and **Final Potential** (Normalized against the clan benchmark).
- **Mechanics**: Implements **Heritage** (momentum bonuses for new members) and **Inertia** (inactivity decay).

---
<br />

## Automation Tasks

The system runs on a precise cron schedule configured by the Orchestrator:

| Task Function | Frequency | Purpose |
| :--- | :--- | :--- |
| `taskWarmUpWorker` | **10 Mins** | Keeps the remote Render instance active to prevent cold starts |
| `taskFastScout` | **30 Mins** | Rapidly scans tournament brackets for new potential recruits (Headhunter) |
| `taskUpdateDatabase` | **1 Hour** | Ingests clan war history and performs deep data deduplication |
| `taskUpdateRoster` | **1 Hour** | Recalculates member scores, updates ranks, and enforces roles |

---
<br />

## Deployment & Configuration

### Script Properties
Required environment variables in **Project Settings > Script Properties**:

- `CLAN_TAG`: Target clan tag (e.g., `#2PP...`).
- `API_KEYS`: Personal `CRK01..CRKn` array of Clash Royale API keys necessary to enable round-robin load balancing and support heavy loads (a minimum of 10 individual keys is recommended).
- `REMOTE_WORKER_URL`: Endpoint of the Render worker (e.g., `https://clash-worker-xyz.onrender.com`).
- `REMOTE_WORKER_SECRET`: Auth token for worker communication.
- `WEB_APP_URL`: The public URL of the deployed PWA client.

### Initial Setup
Run the `createTriggers()` function from the `Orchestrator.ts` file (or via the custom **Clan Manager > Setup Triggers** menu item on the spreadsheet's toolbar) to initialize the automation suite.

---
<br />

## Data Flow & Logic

1.  **Ingestion**: `Database` module pulls raw battle logs via `Network` (Worker Proxy).
2.  **Processing**: `Scoring_Kernel` computes metrics based on `Configuration` weights.
3.  **Persistence**: `Store` modules save state to Sheet Properties and hidden JSON structures.
4.  **Presentation**: `View` modules render pixel-perfect, hygiene-enforced tables in Google Sheets.
5.  **Recruitment**: `Headhunter` module scans external tournaments and updates the "scout feed".

---
<br />

## License

**GNU GPL v3**.
Copyright (c) 2026 AlbiDR.
This project is free software and available under the [GPL v3 License](../LICENSE).
