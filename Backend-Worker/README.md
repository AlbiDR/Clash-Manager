# Clash Manager — Remote Worker (Render)

[![Worker](https://img.shields.io/badge/Worker-v10.1.0-6D409F?style=flat-square&logo=render&logoColor=white)](https://github.com/albidr/Clash-Manager) [![Docs](https://img.shields.io/badge/Docs-Architecture%20%7C%20Deployment-blue?style=flat-square)](../docs/ARCHITECTURE.md) [![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue?style=flat-square)](../LICENSE)

The **Scaling Engine**. A high-performance, strictly typed Express.js server designed to offload heavy data operations from the Google Apps Script environment. It handles bulk URL fetching, intelligent player scanning, deduplication, and complex scoring logic to circumvent generic platform quotas. Hosted on **Render**.

---
<br />

## Technical Specifications

- **Runtime**: Node.js (Express) with TypeScript.
- **Architecture**: Stateless, high-concurrency worker pool.
- **Security**: Bearer token authentication (optional), IAM-restricted invocation, and Smart Key Rotation.
- **Resilience**: Automatic retries with exponential backoff and jitter.

---
<br />

## Configuration

The worker behavior is controlled via environment variables:

| Variable | Default | Description |
| :--- | :--- | :--- |
| `WORKER_CONCURRENCY` | `20` | Max concurrent outbound requests. |
| `WORKER_TIMEOUT_SEC` | `45` | Request timeout in seconds. |
| `WORKER_RETRIES` | `2` | Number of retry attempts for failed upstream requests. |
| `PORT` | `8080` | Server listening port. |
| `API_BASE` | `https://proxy.royaleapi.dev/v1` | Upstream API endpoint. |
| `API_KEYS` | - | Comma-separated list of fallback Clash Royale API keys. |

---
<br />

## API Reference

### 1. System Diagnostics

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

### 2. Batch Operations

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

### 3. Intelligence & Scanning

#### `POST /scan` / `POST /public/scan`
Scans tournament brackets to discover new recruits. Configurable with blacklists and minimum trophy requirements.

**Payload:**
```json
{
  "tags": ["#TOURNEY1", "#TOURNEY2"],
  "blacklist": ["#PLAYER1"],
  "minTrophies": 5000,
  "scoring": null // Optional: Include weights to auto-score found players
}
```

### 4. Clan Data

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

### 5. Administration

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
