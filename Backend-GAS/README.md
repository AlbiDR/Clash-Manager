# Clash Manager — Backend (GAS)

A lean Apps Script backend that performs scheduled ETL, computes member performance scores, and exposes a compact headless API for the PWA.

## Table of contents

- Overview
- Modules
- Setup
- API
- Testing & Troubleshooting

## Modules

| File                      | Purpose                                   |
| ------------------------- | ----------------------------------------- |
| `API_Public.gs.js`        | Router and public endpoints               |
| `Controller_Webapp.gs.js` | Payload generation and caching            |
| `Leaderboard.gs.js`       | War history aggregation and normalization |
| `ScoringSystem.gs.js`     | Scoring algorithms (isolated logic)       |
| `Recruiter.gs.js`         | Tournament scanning and candidate scoring |
| `Configuration.gs.js`     | Weights, penalties, and schema constants  |

## Setup

This section provides a step-by-step guide to deploy and operate the backend.

1. Create a Google Sheet and open the Apps Script editor (or use `clasp` for local development).
2. Copy the `.gs.js` source files into the Apps Script project and rename to `.gs` (the repository keeps `.gs.js` for tooling purposes).
3. Add **Project Script Properties** (Project Settings > Script Properties):
   - `ClanTag` — your clan tag (required)
   - `CRK1..CRKn` — API keys (if used) or config flags
   - `WebAppUrl` — URL of the deployed Web App (used by other services)
4. Configure time-based triggers for scheduled ETL tasks (daily or hourly as needed). Use small batch sizes to avoid quota limits.
5. Deploy the project as a Web App:
   - Execute as: **Me**
   - Who has access: **Anyone** (or limit to your org depending on your setup)
   - Copy the Web App URL and ensure `WebAppUrl` is set correctly.
6. Run the built-in health check: `GET ?action=ping` — returns version and status.

## Configuration & Testing

- Scoring weights and penalties live in `Configuration.gs.js` (adjust with care; compare behavior on a staging sheet first).
- To test changes locally, use `clasp` or the Apps Script editor and run the scoring functions manually on a sandbox sheet.

## Troubleshooting

- If the Web App returns 403/401, verify deployment settings and who the app executes as.
- If ETL fails due to timeouts, reduce batch sizes and add exponential backoff on retries.
- Check Apps Script execution logs and Stackdriver (if enabled) for detailed errors.

## Deployment notes

- Keep production script properties in a secure storage and avoid checking secrets into git. For CI-driven deployments, prefer ephemeral deploy tokens or a controlled service account.

## API

- `GET ?action=getwebappdata` — compressed leaderboard + recruits
- `GET ?action=ping` — health and version
- `POST` — management actions (example: `dismissRecruits`)

For scoring details see the main `README.md` (Scoring section).

## License

Proprietary. © 2026 AlbiDR
