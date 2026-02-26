# Clash Manager — Remote Worker (Render)

[![Worker](https://img.shields.io/badge/Worker-v10.1.0-6D409F?style=flat-square&logo=render&logoColor=white)](https://github.com/albidr/Clash-Manager) [![Docs](https://img.shields.io/badge/Docs-Architecture%20%7C%20Deployment-blue?style=flat-square)](../docs/ARCHITECTURE.md) [![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue?style=flat-square)](../LICENSE)

The **Muscle**. A high-performance, strictly typed Express.js server designed to offload heavy data operations from the Google Apps Script environment. It handles bulk URL fetching, intelligent player scanning, deduplication, and complex scoring logic to circumvent generic platform quotas. Hosted on **Render**.

---
<br />

## Technical Specifications

- **Runtime**: Node.js (Express) with TypeScript.
- **Architecture**: Stateless, high-concurrency worker pool.
- **Security**: Strict Bearer token validation with path-based exemptions.
- **Intelligence**: Integrated "Deep Delegation" scoring and Prophet Cache logic.
- **Resilience**: Automatic retries with exponential backoff and jitter.

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
| `API_KEYS` | - | Comma-separated list of fallback Clash Royale API keys |
| `REMOTE_WORKER_SECRET` | - | Mandatory token for Bearer authentication |

---
<br />

## API Reference

### System Diagnostics

#### `GET /capabilities`
Returns the current worker version and internal configuration limits. Used by the GAS backend for environment discovery.

**Response:**
```json
{
  "status": "success",
  "data": {
    "version": "10.1.1",
    "concurrency": 20,
    "timeoutMs": 45000,
    "maxRetries": 2
  }
}
```

#### `GET /health`
Performs a deep health check, including upstream API connectivity validation and internal key pool statistics.

**Response:**
```json
{
  "status": "success",
  "checks": {
    "upstream": "OK",
    "pool": { "total": 5, "available": 5, "throttled": 0 },
    "memory": 102400
  }
}
```

### Batch Operations

#### `POST /fetch`
The core proxy endpoint. Fetches multiple URLs in parallel with key rotation.

**Payload:**
```json
{
  "urls": ["/players/%23TAG1", "/clans/%23TAG2"],
  "apiKeys": ["sk_..."], // Optional: Overrides server keys
  "scoring": { "TROPHY": 0.4, "DON": 0.3, "WAR": 0.3 } // Optional: For player scoring
}
```

### Intelligence & Scanning

#### `POST /scan` / `POST /public/scan`
Scans tournament brackets to discover new recruits. Configurable with blacklists and minimum trophy requirements. `POST /scan` requires authentication, while `/public/scan` is open.

**Payload:**
```json
{
  "tags": ["#TOURNEY1", "#TOURNEY2"],
  "blacklist": ["#PLAYER1"],
  "minTrophies": 5000,
  "scoring": null, // Optional: Include weights to auto-score found players
  "prophetCache": { "PLAYERTAG": { "wins": 10 } } // Optional: Strategic Intel
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

### Clan Data

#### `POST /clan/full`
Aggregates a complete snapshot of a clan: Members, Current River Race, and aggregated War History.

**Payload:**
```json
{
  "tag": "#CLAN_TAG",
  "apiKeys": []
}
```

#### `POST /clan/api`
Fetches a specific slice of clan data (`members` or `warlog`) and transforms it for frontend consumption.

**Payload:**
```json
{
  "tag": "#CLAN_TAG",
  "type": "members" // or "warlog"
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

---
<br />

## Architecture: Deep Delegation (Strategy 2)

The worker implements a **Deep Delegation** strategy to optimize the entire Clash Manager ecosystem.

1. **Scoring Offload**: By calculating complex player scores server-side (using the `Scoring_Kernel`), the worker reduces GAS execution time and allows for larger batch processing than the GAS environment could handle alone.
2. **Prophet Bonus**: The worker integrates with a "Prophet Cache"—historical war data provided by the GAS backend. When scanning or fetching players, the worker automatically applies a **25% multiplier** (Prophet Bonus) to players with proven historical war success (e.g., >5 wins), ensuring elite candidates are prioritized in the results.

---
<br />

## Security Architecture

The worker enforces a strict security perimeter via `authMiddleware`:

- **Bearer Token**: All privileged requests (`/fetch`, `/scan`, `/clan/*`, `/audit`) must include the `Authorization: Bearer <REMOTE_WORKER_SECRET>` header.
- **Public Exemptions**: To support PWA health checks and public recruitment scans, specific routes (`/`, `/health`, `/capabilities`, `/public/*`) are exempt from token validation.
- **DOS Protection**: Authentication is validated *before* large payloads are parsed, mitigating potential Denial-of-Service attacks.

---
<br />

## Deployment

Deploy directly to **Render** as a Web Service.

### Build & Start Command
- **Build Command**: `pnpm install && pnpm build`
- **Start Command**: `pnpm start`

### Environment Variables
Ensure the following variables are set in the Render Dashboard:

- `WORKER_CONCURRENCY`: `20`
- `WORKER_TIMEOUT_SEC`: `45`
- `API_BASE`: `https://proxy.royaleapi.dev/v1`
- `API_KEYS`: (Comma-separated list)

---
<br />

## License

**GNU GPL v3**.
Copyright (c) 2026 AlbiDR.
This project is free software and available under the [GPL v3 License](../LICENSE).
