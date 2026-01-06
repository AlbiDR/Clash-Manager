# Clash Manager Server (GAS)

<!-- Static badges for the backend as GAS doesn't have a package.json -->
![Platform](https://img.shields.io/badge/Platform-Google%20Apps%20Script-4285F4?style=flat-square&logo=google&logoColor=white)
![Standard](https://img.shields.io/badge/API-REST%20over%20HTTPS-orange?style=flat-square&logo=json)
[![License](https://img.shields.io/badge/License-Proprietary-green?style=flat-square)](https://github.com/albidr/Clash-Manager/blob/Stable/LICENSE)

**Clash Manager Server** is the backend engine powered by Google Apps Script. It acts as the API Gateway, ETL Pipeline, and Database (via Google Sheets) for the Clash Manager ecosystem.

Instead of serving HTML directly (standard GAS Web App), it operates as a **Headless API**, serving compressed JSON to the PWA frontend.

---

## Architecture

```mermaid
graph LR
    CR[Clash Royale API] -->|Proxy| GAS[GAS Backend]
    GAS <-->|Read/Write| DB[(Google Sheets)]
    GAS -->|JSON Response| PWA[Client PWA]
    
    subgraph "Backend Cycle"
    Trigger[Time-Based Trigger] --> ETL[ETL & Scoring]
    ETL --> DB
    end
```

### Core Concepts
1.  **Cycle-Based Execution**: The system updates data on a schedule (Time-based triggers) or on-demand, rather than on every request.
2.  **Mutex Locking**: Uses `LockService` to prevents race conditions. If an update is running, subsequent requests wait or abort safely to prevent database corruption.
3.  **Key Rotation**: Rotates through a pool of API keys to respect Clash Royale API rate limits during heavy scanning operations.

---

## Module ecosystem

| File | Responsibility |
| :--- | :--- |
| **`API_Public`** | **Router**: Handles `doGet`/`doPost` and standardized JSON responses. |
| **`Controller_Webapp`** | **Data Layer**: Generates, compresses, and caches the frontend payload. |
| **`Recruiter`** | **Intelligence**: Runs the "Deep Net" tournament scan to find recruits. |
| **`Leaderboard`** | **Ranking**: Aggregates member stats and calculates war history. |
| **`Logger`** | **Database**: Handles daily snapshots and historical pruning. |
| **`ScoringSystem`** | **Math**: Isolated algorithms for player scoring (Protected Logic). |
| **`Orchestrator & Triggers`** | **Control**: Manages triggers, menus, and update sequences. |
| **`Utilities`** | **Core**: Fetching, backups, and shared helpers. |
| **`Configuration`** | **Config**: Central constants, schema definitions, and API keys. |

---

## Scoring
Performance scoring is implemented in `ScoringSystem.gs.js`. Parameters live in `Configuration.gs.js`. See the repository `README.md` (Scoring section) for a concise formula and rationale.

## Setup

<details>
<summary>Deployment</summary>

1. Create a Google Sheet and open Apps Script.
2. Copy the `.gs.js` files (rename to `.gs`).
3. Add Script Properties: `ClanTag`, `CRK1...CRK10`, `WebAppUrl`.
4. Deploy as a Web App and run the health check.

</details>



---

## API

The backend exposes a single HTTP endpoint.

### Standard Envelope
```json
{
  "status": "success",
  "data": { ... },
  "error": null,
  "timestamp": "ISO_DATE_STRING"
}
```

### Endpoints
*   `GET ?action=getwebappdata`: Returns the monolithic, compressed data payload (Leaderboard + Recruits).
*   `GET ?action=ping`: System health check (returns version and status).
*   `POST`: Accepts JSON body `{ "action": "dismissRecruits", "ids": [...] }` to update the blacklist.

---

## License

Proprietary.
Copyright © 2026 AlbiDR.
