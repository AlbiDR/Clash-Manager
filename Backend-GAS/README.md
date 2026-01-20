# Clash Manager — Backend Engine

[![Version](https://img.shields.io/badge/Version-10.0.0-0066CC?style=flat-square)](https://github.com/albidr/Clash-Manager) [![Docs](https://img.shields.io/badge/Docs-Architecture%20%7C%20Deployment-blue?style=flat-square)](../docs/ARCHITECTURE.md)

The **Data Processing Core**. A lean, modular Google Apps Script engine that orchestrates high-volume ETL, multi-dimensional performance scoring, and a high-availability headless JSON API.

---

## Module Architecture

| Module | Filename | Responsibility |
| :--- | :--- | :--- |
| **Public API** | `API_Public.js` | Routing, handshake, and error handling |
| **Controller** | `Controller_Webapp.js` | Payload generation, compression, and caching |
| **Leaderboard** | `Leaderboard.js` | History aggregation and normalization logic |
| **Scoring** | `ScoringSystem.js` | Canonical performance algorithms and decay logic |
| **Scanning** | `Recruiter.js` | Tournament scanning and candidate identification |
| **Constants** | `Configuration.js` | Weights, thresholds, and schema definitions |

---

## Deployment & Setup

### Script Configuration

Set the following **Project Script Properties** in the Apps Script Editor (`Project Settings > Script Properties`) to activate the engine:

- `ClanTag`: Your primary clan tag (Format: `2PP...`)
- `WebAppUrl`: The URL of this deployment (for cross-service calls)
- `CRK1..CRKn`: Clash Royale API keys (Multiple keys enable round-robin load balancing)

### Continuous Deployment (GitHub Actions)

To enable automated deployments via GitHub Actions, you must configure the following **Repository Secrets** (`Settings > Secrets and variables > Actions`):

| Secret Name    | Description                                                                 |
| :------------- | :-------------------------------------------------------------------------- |
| `SCRIPT_ID`    | The Script ID found in **Apps Script > Project Settings > Script ID**.      |
| `CLASPRC_JSON` | The content of your local `~/.clasprc.json` file (after running `clasp login`). |

### Triggers

The engine is intended to run as a cron-daemon. Configure time-based triggers for:

- `hourlyUpdate`: Main ETL and scoring sequence
- `recruiterSync`: Background tournament scanning

---

## Headless API Handshake

The backend communicates via a standardized JSON envelope consumed by the Vue 3 Frontend (PWA).

### Actions

- `GET ?action=getwebappdata`: Returns the unified matrix payload (LB + HH)
- `GET ?action=ping`: Health check, versioning info, and latency metrics
- `POST { action: 'dismissRecruits', ids: [...] }`: Mutation for recruiter state

---

## Scaling Engine

For high-volume scanning (1000+ members/candidates), the engine supports the **Remote Worker Protocol**.
By setting `RemoteWorkerUrl` in the script properties, the GAS engine offloads bulk URL fetching to an external compute layer (e.g., Cloud Run), bypassing Google's `UrlFetchApp` daily quotas.

---

## Reliability & Safety

- **Idempotency**: All ETL jobs are safely re-runnable without data duplication
- **Matrix Normalization**: Data is transported in compressed matrices to minimize GAS execution time and client download weight
- **Fail-Safe Scoring**: Scoring logic is isolated and unit-tested to ensure performance metrics stay accurate even with partial API data

---

## License

Proprietary. © 2026 AlbiDR. All rights reserved.
