# Clash Manager -- Remote Worker (Render)

[![Worker](https://img.shields.io/badge/Worker-v10.1.4-6D409F?style=flat-square&logo=render&logoColor=white)](https://github.com/albidr/Clash-Manager) [![Docs](https://img.shields.io/badge/Docs-Architecture%20%7C%20Deployment-blue?style=flat-square)](../.github/authoritative-design-references/CleanStack%20Architecture.md) [![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue?style=flat-square)](../LICENSE)

The **Muscle**. A high-performance, strictly typed Express.js server designed to offload heavy data operations from the Google Apps Script environment. It handles bulk URL fetching, intelligent player scanning, deduplication, and complex scoring logic to circumvent generic platform quotas. Hosted on **Render**.

---
<br />

## Technical Specifications

- **Layer**: Layer 1 (@core) / Layer 5 (@root) bridge.
- **Role**: Infrastructure kernel for high-concurrency network delegation and autonomous data synchronization.
- **Runtime**: Node.js (Express) with TypeScript.
- **Architecture**: Registry-based service pattern with isolated business modules.
- **Security**: Strict Bearer token validation with path-based exemptions and SSRF prevention.
- **Intelligence**: Integrated "Deep Delegation" scoring and Prophet Cache logic.
- **Resource Management**: Proactive "Quota Guard" (15,000 daily request limit) to preserve the shared Royale API budget.
- **Resilience**: Automatic retries with exponential backoff and jitter.

---
<br />

## System Architecture

The worker follows the **CleanStack Architecture** (Section II), organizing logic into distinct services and controllers:

| Layer | Responsibility | Key Modules |
| :--- | :--- | :--- |
| **Control** | Public API ingress, routing, and authentication | `index.ts`, `WorkerHubController.ts` |
| **Services** | High-level business logic (Recruitment & Scoring) | `RecruitmentService.ts`, `PayloadKernel.ts` |
| **Drivers** | Low-level hardware/network brokerage | `RoyaleApiService.ts`, `HubPersistenceService.ts` |
| **Registry** | Singleton management and pool statistics | `KeyService.ts`, `Network.ts` |

---
<br />

## Configuration

The worker behavior is controlled via environment variables:

| Variable | Default | Description |
| :--- | :--- | :--- |
| `WORKER_CONCURRENCY` | `20` | Max concurrent outbound requests |
| `WORKER_TIMEOUT_SEC` | `45` | Request timeout in seconds |
| `WORKER_RETRIES` | `2` | Number of retry attempts for failed upstream requests |
| `PORT` | `8080` | Server listening port |
| `API_BASE` | `https://proxy.royaleapi.dev/v1` | Upstream API endpoint |
| `API_KEYS` | - | Comma-separated list of `CRK01..CRK10` tokens |
| `REMOTE_WORKER_SECRET` | - | Mandatory token for Bearer authentication |
| `VITE_GAS_URL` or `GAS_URL` | - | Location of the upstream GAS Web App for the Sync Daemon |

---
<br />

## API Reference

### System Diagnostics

#### `GET /`
Simple connectivity check.

**Response:**
```text
Clash Manager Worker is running
```

#### `GET /capabilities`
Returns the current worker version and internal configuration limits. Used by the GAS backend for environment discovery.

**Response:**
```json
{
  "status": "success",
  "data": {
    "version": "10.1.4",
    "concurrency": 20,
    "timeoutMs": 45000,
    "maxRetries": 2
  }
}
```

> **Note**: The Worker Hub currently returns raw matrices (arrays of arrays) as provided by the GAS dumb store. Re-hydration and field mapping are performed by the PWA's `GasClient.ts` to minimize Worker-side transformation overhead.

#### `GET /health`
Performs a multi-tier health check to ensure the worker is operational. **Upstream API connectivity validation** is performed only for authenticated callers to prevent unauthorized quota depletion.

**Response:**
```json
{
  "status": "success",
  "checks": {
    "upstream": "OK",
    "pool": { "total": 10, "available": 10, "throttled": 0 },
    "memory": 102400
  }
}
```

### Worker Data Hub

#### `GET /hub/state`
Returns the 0ms-latency L1 Memory Cache representing the current `HubState` for the PWA. Fails over to atomic L2 Disk Cache during a cold boot.

> **Note**: Returns a **503 Service Unavailable** response with a structured `HubError` (`ERR_STATE_MISSING`) if the state has not yet been initialized or synced from the GAS backend. The error object includes the `layer` field (e.g., `WORKER_PERSISTENCE`) to assist in distributed debugging.

**Response:**
```json
{
  "success": true,
  "data": {
    "metadata": {
      "timestamp": "2026-01-01T12:00:00.000Z",
      "lastCompiled": "2026-01-01T12:00:00.000Z",
      "lastFetched": "2026-01-01T11:55:00.000Z",
      "status": "healthy",
      "version": "10.1.4",
      "source": "RENDER_WORKER"
    },
    "data": {
      "roster": [
        ["", "Clan Leaderboard"],
        ["", "Tag", "Name", "Role", "Trophies", "Days Tracked", "Received Weekly", "Average Daily Donations", "Total Donations", "Last Seen", "War Rate", "Average War Fame", "War History", "Performance Raw Score", "Performance Score", "Trend"],
        ["", "#P1", "Player 1", "Leader", 7500, 150, 200, 50, 7500, "2026-01-01T12:00:00Z", "100%", 2400, "2400 26W01 | 2500 26W02", 50000, 100, 250]
      ],
      "headhunter": [
        ["", "Headhunter Pool"],
        ["", "Tag", "Invited", "Name", "Trophies", "Donations", "Cards Won", "War Wins", "Found Date", "Potential Raw Score", "Potential Score", "Last Scan (Timestamp)"],
        ["", "#R1", false, "Recruit 1", 8000, 500, 1000, 50, "2026-01-01T10:00:00Z", 48000, 95, "2026-01-01T11:55:00Z"]
      ]
    }
  }
}
```

#### `POST /hub/sync/manual`
Manually triggers a background synchronization cycle. Requires Bearer authentication. Protects against overlaps.

**Response:**
```json
{
  "success": true
}
```

### Batch Operations

#### `POST /fetch`
The core proxy endpoint. Fetches multiple URLs in parallel with key rotation.

**Payload:**
```json
{
  "urls": [
    "https://proxy.royaleapi.dev/v1/players/%23TAG1",
    "https://proxy.royaleapi.dev/v1/clans/%23TAG2"
  ],
  "apiKeys": ["sk_key1", "sk_key2"],
  "scoring": { "TROPHY": 0.4, "DON": 0.3, "WAR": 0.3 },
  "minTrophies": 5000
}
```

**Response:**
```json
{
  "results": [
    { "code": 200, "content": { "tag": "#TAG1", "name": "...", "trophies": 6500 } },
    { "code": 200, "content": null } // Discarded: Trophies < minTrophies
  ]
}
```

> **Note**: If `minTrophies` is specified and a player's **Effective Trophies** do not meet the threshold, the response `content` will be `null`.

### Intelligence & Scanning

#### `POST /scan` / `POST /public/scan`
Scans tournament brackets to discover new recruits. Orchestrates two phases: Discovery (Phase 1) and optional Scoring (Phase 2).

- **`/scan`**: Privileged entry point; requires authentication. Includes advanced telemetry (`trace`) and deep Prophet Cache integration. `apiKeys` are **optional** (falls back to internal pool).
- **`/public/scan`**: Public entry point. Requires **mandatory** `apiKeys` in the payload to prevent unauthorized usage of the worker's internal key pool.

> **Note**: These endpoints are subject to **Input Bounding**. `/public/scan` allows up to **25** tags/blacklist entries, while `/scan` allows up to **100**.

**Payload:**
```json
{
  "tags": ["#TOURNEY1", "#TOURNEY2"],
  "apiKeys": ["sk_key1", "sk_key2"],
  "blacklist": ["#PLAYER1"],
  "minTrophies": 5000,
  "scoring": { "TROPHY": 1.0, "DON": 0.07, "WAR": 20.0 },
  "prophetCache": { "PLAYERTAG": { "wins": 10 } }
}
```

**Response (`/public/scan`):**
```json
{
  "candidates": [
    { "tag": "#R1", "name": "Recruit 1", "trophies": 6500, "rawScore": 12500, ... }
  ],
  "_debug": {
    "phase1": 50,
    "phase2": 10,
    "apiBase": "..."
  }
}
```

**Response (`/scan` — Privileged):**
```json
{
  "candidates": [
    { "tag": "#R1", "name": "Recruit 1", "trophies": 6500, "rawScore": 12500, ... }
  ],
  "_debug": {
    "phase1": 50,
    "phase2": 10,
    "apiBase": "...",
    "trace": {
      "firstUrl": "...",
      "firstStatus": 200,
      "firstContent": "...",
      "keyUsed": "..."
    }
  },
  "_metadata": {
    "version": "10.1.4",
    "uptime": 3600,
    "pool": { "total": 10, "available": 10, "throttled": 0 },
    "envKeys": true
  }
}
```

#### `POST /public/subscribe`
Registers a Web Push subscription endpoint for background notifications.

**Payload:**
```json
{
  "endpoint": "https://fcm.googleapis.com/...",
  "keys": { "p256dh": "...", "auth": "..." }
}
```

**Response:**
```json
{
  "success": true,
  "count": 1
}
```

### Clan Data

#### `POST /clan/full`
Aggregates a complete snapshot of a clan: Members, Current River Race, and aggregated War History.

**Payload:**
```json
{
  "tag": "#CLAN_TAG",
  "apiKeys": ["sk_key1", "sk_key2"]
}
```

**Response:**
```json
{
  "members": { "items": [...] },
  "race": { "state": "...", "clan": { ... }, "standings": [...] },
  "history": { "#P1": { "26W01": 2400, "26W02": 2500 } }
}
```

#### `POST /clan/api`
Fetches a specific slice of clan data (`members` or `warlog`) and transforms it for frontend consumption.

**Payload:**
```json
{
  "tag": "#CLAN_TAG",
  "type": "members",
  "apiKeys": ["sk_key1", "sk_key2"]
}
```

**Response:**
```json
{
  "data": [
    {
      "tag": "#P1",
      "name": "Player 1",
      "role": "Leader",
      "kingLevel": 15,
      "trophies": 7500,
      "donations": 500,
      "donationsReceived": 200
    }
  ]
}
```

### Administration

#### `POST /audit`
Validates a list of API keys against the upstream provider to check for validity and quotas.

**Payload:**
```json
{
  "apiKeys": ["sk_key1", "sk_key2"]
}
```

**Response:**
```json
{
  "results": [
    { "key": "sk_key1", "status": 200 },
    { "key": "sk_key2", "status": 403 }
  ]
}
```

---
<br />

## Nightly Maintenance

The monorepo is governed by a **7-agent Nightly Pipeline** (powered by Google Jules and GitHub Actions). This autonomous system executes nightly to audit dependency security, verify architectural compliance, and ensure documentation synchronization across all monorepo components.

---
<br />

## Architecture: Deep Delegation (Strategy 2)

The worker implements a **Deep Delegation** strategy to optimize the entire Clash Manager ecosystem.

1. **Scoring Offload**: By calculating complex player scores server-side (using the Scoring_Kernel), the worker reduces GAS execution time and facilitates larger batch processing. Recruitment scoring results are automatically sliced to the **top 200** candidates, preventing massive payload inflation when returning data to the GAS "Dumb Store".
2. **Effective Trophies**: To support the game's tiered ranking system, the worker calculates "Effective Trophies" by summing a player's global ladder trophies and their current season league trophies (only if global trophies >= 9,000). This value is used for both recruitment scoring and `minTrophies` filtering.
3. **Prophet Bonus**: The worker integrates with a "Prophet Cache"—historical war data provided by the GAS backend. When scanning or fetching players, the worker automatically applies a **25% multiplier** (Prophet Bonus) to players with proven historical war success (e.g., >5 wins), ensuring elite candidates are prioritized in the results.

---

## Resource Management (Quota Guard)

To preserve the project's shared Royale API budget and prevent accidental exhaustion by the autonomous Hub, the worker implements a strict **Quota Guard**:

- **Daily Budget**: All Royale API traffic originating from the worker is capped at **15,000 requests per 24-hour period** (configured via `MAX_FETCH_DAILY_GUARD` in `Network.ts`).
- **Fail-Fast Evaluation**: High-volume operations (`processBatch`, `processScanBatch`, `audit`) perform an estimated usage check before execution using `Network.quotaCheck()`. If the operation would exceed the remaining budget, it is aborted with a `ERR_QUOTA_EXHAUSTED` HubError.
- **Error Classification**: The worker utilizes robust error classification at the Layer 5 control surface. Structured `HubError` objects (like quota exhaustion) are validated via Valibot and reported with human-readable messages to ensure clear diagnostic feedback for the PWA and GAS backend.
- **Real-Time Tracking**: Every upstream request is tracked in memory (ephemeral) via `Network.addQuotaUsage()` and reset daily at 00:00 UTC.

---
<br />

## Security Architecture

The worker enforces a strict security perimeter via `authMiddleware`:

- **Bearer Token**: All privileged requests (`/fetch`, `/scan`, `/clan/*`, `/audit`, `/hub/sync/manual`, `/hub/state`) must include the `Authorization: Bearer <REMOTE_WORKER_SECRET>` header.
- **Auth Path Normalization**: Trailing slashes are automatically stripped from request paths before authentication and public exemption checks, ensuring consistent security enforcement.
- **Public Exemptions**: To support PWA health checks and public recruitment scans, specific routes (`/`, `/health`, `/capabilities`, `/public/scan`, `/public/subscribe`) are exempt from token validation.
- **DOS Protection**: Authentication is validated before large payloads are parsed, mitigating potential Denial-of-Service attacks.
- **SSRF Prevention (Validation Boundary)**: The `/fetch` endpoint utilizes a strict `v.url()` and origin/path-prefix check (Valibot) to ensure requested URLs target only the authorized Royale API base (configured via `API_BASE`). This prevents Server-Side Request Forgery and unauthorized exfiltration of internal resources. Requests are further bounded to **100** URLs per batch to mitigate bulk scanning abuse.

### Defense in Depth: Zero-Trust Validation
The worker implements a **Defense in Depth** strategy by enforcing strict Valibot schema validation at every Layer 1 boundary.

- **Upstream Verification**: All data received from the Royale API (Player Profiles, Tournament Lists, War Logs) is passed through rigorous schemas (e.g., `RoyalePlayerSchema`, `RoyaleTournamentResponseSchema`) before reaching the scoring logic. This ensures that malformed or unexpected upstream data cannot trigger runtime crashes or pollute internal calculations.
- **Payload Hardening**: Inbound requests from the GAS backend and PWA are validated against specialized Request Schemas, ensuring that all parameters (tags, API keys, scoring weights) conform to expected formats and limits.
- **Fail-Fast Boundaries**: Validation occurs at the earliest possible entry point, preventing unvalidated data from propagating into the high-performance worker pool.

### Data Integrity: Tag Normalization
Runtime integrity is enforced at the Layer 1 validation boundary. The `TagSchema` (Valibot) ensures that all player, clan, and tournament tags are normalized before processing:
- **Case Sensitivity**: All tags are automatically converted to **UPPERCASE**.
- **Prefix Consistency**: Tags are prepended with a mandatory **'#'** prefix if missing.

This serves as a critical **Security Boundary** for the recruitment blacklist and Prophet Cache, ensuring that entries cannot be bypassed or duplicated by varying the input format (e.g., `#abcd` vs `ABCD`).

### Input Bounding
To mitigate Denial-of-Service (DoS) and resource exhaustion attacks, the worker enforces strict input boundaries at the Layer 1 validation boundary:
- **JSON Payload Limit**: The Express server restricts incoming JSON request bodies to **5MB** (configured in `index.ts`).
- **API Key Pool Bounding**: Audit, Fetch, and Scan requests are restricted to a maximum of **100** API keys per payload (`v.maxLength`) to prevent excessive key rotation overhead.
- **URL Batch Bounding**: The `/fetch` endpoint is limited to **100** URLs per request to ensure predictable execution times and prevent resource exhaustion.
- **Prophet Cache Bounding**: Scan operations restrict the `prophetCache` to **1,000** entries to maintain efficient in-memory lookups during scoring.
- **Tag Array Bounding**: Recruitment scan requests are bounded by `v.maxLength` (Valibot) and mandatory `apiKeys` (v.minLength(1)) to prevent unauthenticated quota depletion:
  - **Public Scan (`/public/scan`)**: Limited to **25** tournament tags and **25** blacklist tags.
  - **Internal Scan (`/scan`)**: Limited to **100** tournament tags and **100** blacklist tags.
- **Push Subscription Bounding**: Web Push registration is capped at **10,000** in-memory subscriptions (`MAX_SUBSCRIPTIONS`). Individual fields are also bounded (`endpoint`: 500, `p256dh`: 200, `auth`: 200) to prevent memory exhaustion.

---
<br />

## Deployment

Deploy directly to **Render** as a Web Service.

### Build & Start Command
- **Build Command**: `pnpm install && pnpm build` (Installs dependencies and executes `tsc` to compile TypeScript)
- **Start Command**: `pnpm start` (Runs the compiled JavaScript from `dist/`)

### Environment Variables
Ensure the following variables are set in the Render Dashboard:

- `WORKER_CONCURRENCY`: `20`
- `WORKER_TIMEOUT_SEC`: `45`
- `API_BASE`: `https://proxy.royaleapi.dev/v1`
- `API_KEYS`: (Comma-separated list of `CRK01..CRK10` tokens)
- `REMOTE_WORKER_SECRET`: (Mandatory Bearer token)
- `VITE_GAS_URL` or `GAS_URL`: (Location of the GAS Web App for the Hub Daemon)

---
<br />

## Key Rotation Protocol

The worker utilizes a randomized round-robin rotation for all provided keys. If a key encounters a `429` (Throttled) or `403` (Rejected) error, it is automatically sidelined for a cooling period (60s and 1hr respectively) to ensure the pool remains healthy. While the system recommendation follows the `CRK` prefix convention for provisioning, the worker processes all valid tokens provided in the environment.

---
<br />

## License

**GNU GPL v3**.
Copyright (c) 2026 AlbiDR.
This project is free software and available under the **GPL v3 License** (../LICENSE).
