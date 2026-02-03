# Clash Manager — Google Apps Script Engine

[![Version](https://img.shields.io/badge/Version-13.0.0-0F9D58?style=flat-square)](https://github.com/albidr/Clash-Manager) [![Docs](https://img.shields.io/badge/Docs-Architecture%20%7C%20Deployment-blue?style=flat-square)](../docs/ARCHITECTURE.md)

The **Operational Core**. A high-performance, event-driven Google Apps Script runtime that serves as the "Brain" of the Clash Manager ecosystem. It implements a strict **Registry-based Service Architecture** to decouple business logic, persistent storage, and UI presentation.

---

## System Architecture

The codebase adheres to the **"Clean Stack"** philosophy, organized into distinct layers:

| Layer | Responsibility | Key Modules |
| :--- | :--- | :--- |
| **Orchestrator** | Event handling, cron jobs, and master protocol execution | `Orchestrator.ts`, `Triggers.ts` |
| **Registry** | Dependency injection and service location | `Registry.ts`, `Core.ts` |
| **Services** | Pure business logic and complex calculations | `Scoring_Kernel.ts`, `Network.ts`, `Time.ts` |
| **Modules** | Domain-specific features (MVCS Pattern) | `Roster`, `Headhunter`, `Database` |
| **Views** | Sheet manipulation and UI rendering | `View.ts`, `*_View.ts` |
| **Stores** | Data persistence and state management | `Store.ts`, `*_Store.ts` |

---

## Key Components

### 1. Network Engine (`Network.ts`)
A sophisticated API gateway that manages the limited Google Apps Script quotas.
- **Multi-Tier Caching**: Uses L1 (Execution Memory) and L2 (ScriptCache) to deduplicate requests.
- **Remote Delegation**: Automatically offloads high-volume batches (>5 requests) and heavy computations to the **Backend-Worker** (Render).
- **Smart Rotation**: Manages a pool of API keys with automatic failure handling and cooling periods.

### 2. The Orchestrator (`Orchestrator.ts`)
The central nervous system that manages automation lifecycles.
- **Master Protocol**: `dispatchMaster()` executes the full ETL pipeline sequentially (Ingest -> Analyze -> Scout -> Clean).
- **Self-Healing**: Automatically detects and repairs broken triggers or UI controls.
- **Mobile Controls**: Listens for checkbox interactions on specific sheets (`handleMobileEdit`) to trigger on-demand syncs.

### 3. Scoring Kernel (`Scoring_Kernel.ts`)
A pure mathematical engine isolated from the rest of the system.
- **Performance Metrics**: Calculates member value via `Raw Performance` (Lifetime) and `Final Performance` (Decayed + Heritage).
- **Potential Metrics**: Evaluates recruits via `Raw Potential` (Unweighted) and `Final Potential` (Normalized against clan benchmark).
- **Mechanics**: Implements **Heritage** (momentum bonuses) and **Inertia** (inactivity decay).


---

## Automation Tasks

The system runs on a precise cron schedule configured by the Orchestrator:

| Task Function | Frequency | Purpose |
| :--- | :--- | :--- |
| `taskWarmUpWorker` | **10 Mins** | Keeps the remote Render instance active to prevent cold starts. |
| `taskFastScout` | **30 Mins** | Rapidly scans tournament brackets for new potential recruits (Headhunter). |
| `taskUpdateDatabase` | **1 Hour** | Ingests clan war history and performs deep data deduplication. |
| `taskUpdateRoster` | **1 Hour** | Recalculates member scores, updates ranks, and enforces roles. |

---

## Deployment & Configuration

### 1. Script Properties
Required environment variables in **Project Settings > Script Properties**:

- `CLAN_TAG`: Target clan tag (e.g., `#2PP...`).
- `API_KEYS`: JSON array of Clash Royale API keys.
- `REMOTE_WORKER_URL`: Endpoint of the Render worker (e.g., `https://clash-worker-xyz.onrender.com`).
- `REMOTE_WORKER_SECRET`: Auth token for worker communication.

### 2. Initial Setup
Run the `createTriggers()` function from the `Orchestrator.ts` file (or via the **Clan Manager > Admin > Reset Triggers** menu) to initialize the automation suite.

---

## Data Flow & Logic

1.  **Ingestion**: `Database` module pulls raw battle logs via `Network` (Worker Proxy).
2.  **Processing**: `Scoring_Kernel` computes metrics based on `Configuration` weights.
3.  **Persistence**: `Store` modules save state to Sheet Properties and hidden JSON structures.
4.  **Presentation**: `View` modules render pixel-perfect, hygiene-enforced tables in Google Sheets.
5.  **Recruitment**: `Headhunter` module scans external tournaments and updates the "scout feed".

---

## License

Proprietary. © 2026 AlbiDR. All rights reserved.
