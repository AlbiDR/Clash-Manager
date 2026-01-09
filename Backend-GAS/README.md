# Clash Manager — Backend (GAS)

The **Data Processing Core**. A lean, modular Google Apps Script engine that orchestrates high-volume ETL, multi-dimensional performance scoring, and a high-availability headless JSON API.

---

## 🏛️ Module Architecture

| Module          | Filename                  | Responsibility                                    |
| :-------------- | :------------------------ | :------------------------------------------------ |
| **Public API**  | `API_Public.gs.js`        | Routing, handshake, and error handling.           |
| **Controller**  | `Controller_Webapp.gs.js` | Payload generation, compression, and caching.     |
| **Leaderboard** | `Leaderboard.gs.js`       | History aggregation and normalization logic.      |
| **Scoring**     | `ScoringSystem.gs.js`     | Canonical performance algorithms and decay logic. |
| **Scanning**    | `Recruiter.gs.js`         | Tournament scanning and candidate identification. |
| **Constants**   | `Configuration.gs.js`     | Weights, thresholds, and schema definitions.      |

---

## ⚙️ Deployment & Setup

### 1. Script Configuration

Set the following **Project Script Properties** to activate the engine:

- `ClanTag`: Your primary clan tag (Format: `2PP...`).
- `WebAppUrl`: The URL of this deployment (for cross-service calls).
- `CRK1..CRKn`: Clash Royale API keys (Multiple keys enable round-robin load balancing).

### 2. Triggers

The engine is intended to run as a cron-daemon. Configure time-based triggers for:

- `hourlyUpdate`: Main ETL and scoring sequence.
- `recruiterSync`: Background tournament scanning.

---

## 📡 Headless API Handshake

The backend communicates via a standardized JSON envelope consumed by the Tauri client.

### Actions

- `GET ?action=getwebappdata`: Returns the unified matrix payload (LB + HH).
- `GET ?action=ping`: Health check, versioning info, and latency metrics.
- `POST { action: 'dismissRecruits', ids: [...] }`: Mutation for recruiter state.

---

## 📈 The Heavy-Lift Scaling Engine

For high-volume scanning (1000+ members/candidates), the engine supports the **Remote Worker Protocol**.
By setting `RemoteWorkerUrl` in the script properties, the GAS engine offloads bulk URL fetching to an external compute layer (e.g., Cloud Run), bypassing Google's `UrlFetchApp` daily quotas.

---

## 🛡️ Reliability & Safety

- **Idempotency**: All ETL jobs are safely re-runnable without data duplication.
- **Matrix Normalization**: Data is transported in compressed matrices to minimize GAS execution time and client download weight.
- **Fail-Safe Scoring**: Scoring logic is isolated and unit-tested to ensure performance metrics stay accurate even with partial API data.

---

## 📜 License

Proprietary. © 2026 AlbiDR. All rights reserved.
