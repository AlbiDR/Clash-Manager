# Clash Manager -- Google Apps Script Engine

[![System](https://img.shields.io/badge/System-v14.3.4-0F9D58?style=flat-square&logo=google-apps-script&logoColor=white)](https://github.com/albidr/Clash-Manager) [![Docs](https://img.shields.io/badge/Docs-Architecture%20%7C%20Deployment-blue?style=flat-square)](../.github/authoritative-design-references/CleanStack%20Architecture.md) [![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue?style=flat-square)](../LICENSE)

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
| **Data Hub** | High-speed raw extraction for Worker Sync | `API_Raw.ts` |

---
<br />

## Key Components

### Network Engine (`Network.ts`)
A sophisticated API gateway that manages the limited Google Apps Script quotas.
- **Multi-Tier Caching**: Uses L1 (Execution Memory) and L2 (ScriptCache) to deduplicate requests.
- **Remote Delegation**: Automatically offloads requests to the **Backend-Worker** (Render) to preserve local quota.
- **Quota Guard**: Implements a strict **>50 batch quota guard** that prevents local fallbacks for large requests if the worker is offline, protecting the core service from accidental exhaustion.
- **Smart Rotation**: Manages a pool of API keys with automatic failure handling and cooling periods.

### Worker Hub Integration (`API_Raw.ts`)
A minimalist "Dumb Store" access layer designed exclusively for the Worker's 5-minute synchronization daemon.
- **Raw Export**: Bypasses the traditional PWA JSON matrix compression and directly returns unadulterated sheet arrays.
- **Dedicated Authentication**: Validates requests securely against `REMOTE_WORKER_SECRET` allowing the Render worker continuous access without Oauth friction.

### The Orchestrator (`Orchestrator.ts`)
The central nervous system that manages automation lifecycles.
- **Master Protocol**: `dispatchMaster()` executes the full ETL pipeline sequentially (Ingest -> Analyze -> Scout -> Clean).
- **Self-Healing**: Automatically detects and repairs broken triggers or UI controls.
- **Mobile Controls**: Listens for checkbox interactions in **cell A1** of specific sheets (`handleMobileEdit`) to trigger on-demand syncs, enabling management via the mobile app.

### Scoring Kernel (`Scoring_Kernel.ts`)
A pure mathematical engine isolated from the rest of the system. It operates on a dual-metric architecture to ensure both historical achievement and current form are accurately represented.

<details>
<summary><strong>Member Performance Metrics (RPeS & PeS)</strong></summary>

Internal scoring is designed to reward both long-term reliability and short-term excellence.

- **RPeS (Raw Performance Score)**: The unweighted sum of multiple performance vectors (Fame, Avg War Fame, Donations, Trophies, and War Rate).
- **PeS (Performance Score)**: A relative normalization of the RPeS.
  - **Normalization**: Calculated as `(Member RPeS / Benchmark) * 100`.
  - **Relative Curve**: Ensures the leaderboard remains a "relative curve" regardless of meta shifts.

</details>

<details>
<summary><strong>Recruit Potential Metrics (RPoS & PoS)</strong></summary>

External scoring focuses on identifying "elite fits" for the clan by comparing candidates against the existing internal elite.

- **RPoS (Raw Potential Score)**: Calculates an unweighted base score for recruits using external stats:
  - **Trophy Weight**: Base player capability.
  - **Donation Weight**: Contribution baseline.
  - **War Weight**: Historical reliability in clan wars (War Day Wins).
  - **War Baseline Bonus**: A fixed credit (default: 500) applied to recruits with recent activity to prevent "Newbie Gaps".
- **PoS (Potential Score)**: The final aligned metric.
  - **Hybrid Benchmark**: A blended target calculated from the current "Elite Roster" (members with PeS > 50%) and the **Market Intelligence** reference (top 5% of all scanned recruits).
  - **Alignment**: Normalized against this hybrid benchmark to ensure recruits are scored on the same scale as internal members.

</details>

<details>
<summary><strong>Intelligence & Caching</strong></summary>

- **Market Intelligence**: The collective performance baseline derived from high-volume tournament scanning. It defines the "top percentile" of the current available recruit pool.
- **Prophet Cache**: A persistent memory of external player performance. When a player is scanned multiple times, the Prophet Cache tracks their consistency.
- **Prophet Bonus**: A **25% RPoS multiplier** applied to recruits with proven historical war success (e.g., >5 wins) detected via the Prophet Cache.

</details>

<details>
<summary><strong>Temporal Mechanics</strong></summary>

- **Inertia (Decay)**: Exponential decay applied to players who haven't been seen recently.
  - `decayedScore = rawScore * (1 - decayRate) ^ (daysInactive - graceDays)`
- **Heritage (Blessing)**: A quadratic "momentum bonus" given to new members based on their recruitment RPoS. This ensures they maintain high visibility on the leaderboard until their internal stats stabilize.
  - `heritageBonus = (recruitRaw * factor) / divisor` where `factor` is a quadratic time-decay.

</details>

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

## Nightly Maintenance

The monorepo is governed by a **7-agent Nightly Pipeline** that operates outside the standard GAS runtime. This autonomous system executes via GitHub Actions to ensure the structural integrity of the `Backend-GAS` source code, synchronize documentation, and audit security boundaries before major release tags.

---
<br />

## Deployment & Configuration

### Script Properties
Required environment variables in **Project Settings > Script Properties**:

- `CLAN_TAG`: Target clan tag (e.g., `#2PP...`).
- `PLAYER_TAG`: (Optional) Your personal Player Tag (e.g., `#UR...`) for administrative context in the PWA.
- `API_KEYS`: Sequential `CRK01..CRK10` array of Clash Royale API keys. A minimum of 10 keys is mandatory to support the high-volume Headhunter scanning protocols.
- `REMOTE_WORKER_URL`: Endpoint of the Render worker (e.g., `https://clash-worker-xyz.onrender.com`).
- `REMOTE_WORKER_SECRET`: Auth token for worker communication.
- `WEB_APP_URL`: The public URL of the deployed PWA client.

### Initial Setup
1. **Spreadsheet Context**: This system is designed as a **Container-Bound** script. Create a new Google Sheet before deployment.
2. **Push**: Use `clasp push` to sync the repository with your Google Sheet.
3. **Deployment**: Manually deploy the script as a **Web App** (Deploy > New Deployment > Select type: Web App).
   - **Execute as**: `Me`
   - **Who has access**: `Anyone` (Mandatory for PWA headless integration).
4. **Triggers**: Run the `createTriggers()` function from the `Orchestrator.ts` file (or via the custom **Clan Manager > Setup Triggers** menu item on the spreadsheet's toolbar) to initialize the automation suite.

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
